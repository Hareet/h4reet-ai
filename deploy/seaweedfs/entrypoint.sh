#!/bin/sh
# SeaweedFS as Langfuse's S3 store (spec 000 FR-027; plan §6; research.md R-09; ADR 0022). deploy/compose.yaml runs this
# as the container's entrypoint, mounted read-only from the tree. In order:
#   1. it renders the S3 identity file from SEAWEEDFS_S3_ACCESS_KEY and SEAWEEDFS_S3_SECRET_KEY into /tmp/s3.json, on
#      a tmpfs, mode 0600, so the keys never reach the volume or the image;
#   2. it starts `weed server`, with its data on the volume at /data, S3 on 8333 inside the stack, and its logs on
#      stderr for Docker's local driver;
#   3. it waits for the master, then creates the langfuse bucket unless it is there, so a restart finds it as it was;
#   4. it marks the bucket ready, which the health check reads, and waits on the server, passing on a stop signal.
# Usage reporting is off where the pinned version has a switch for it (plan §6): a boolean flag named telemetry, alone
# or under a component (-master.telemetry), is set to false; any other telemetry flag is named in the log for the
# Author. The internal network, which has no route out, would block a report anyway.
set -eu

ready=/tmp/h4-bucket-ready
master=127.0.0.1:9333

fail() {
	echo "seaweedfs entrypoint: $*" >&2
	exit 1
}

rm -f "$ready"

# 1. The S3 identity: one, for Langfuse, which reads, writes, lists, and tags its objects. The generated keys are
#    letters and digits (contracts/env-files.md §9.2), so they go into the JSON as they are; anything else is refused,
#    never escaped, and never printed.
access="${SEAWEEDFS_S3_ACCESS_KEY:-}"
secret="${SEAWEEDFS_S3_SECRET_KEY:-}"
case "$access" in '' | *[!A-Za-z0-9]*) fail "SEAWEEDFS_S3_ACCESS_KEY is empty, or isn't letters and digits" ;; esac
case "$secret" in '' | *[!A-Za-z0-9]*) fail "SEAWEEDFS_S3_SECRET_KEY is empty, or isn't letters and digits" ;; esac
umask 077
printf '{"identities":[{"name":"langfuse","credentials":[{"accessKey":"%s","secretKey":"%s"}],"actions":["Read","Write","List","Tagging"]}]}\n' \
	"$access" "$secret" >/tmp/s3.json
unset access secret

# 2. The server. Go's flag listing gives a boolean as "-name" alone, and any other flag as "-name type".
set -- weed -logtostderr=true server -dir=/data -s3 -s3.port=8333 -s3.config=/tmp/s3.json
flags="$(weed server -h 2>&1 | grep -E '^[[:space:]]*-[A-Za-z0-9.]*[Tt]elemetry' || true)"
while read -r name kind; do
	[ -n "$name" ] || continue
	name="${name#-}"
	if [ -z "${kind:-}" ] && [ "${name##*.}" = telemetry ]; then
		set -- "$@" "-$name=false"
		echo "seaweedfs entrypoint: usage reporting off (-$name=false)"
	else
		echo "seaweedfs entrypoint: weed server has -$name${kind:+ $kind}, which this script leaves alone" >&2
	fi
done <<EOF
$flags
EOF

"$@" &
pid=$!
stop() {
	kill -TERM "$pid" 2>/dev/null || true
	wait "$pid" || true
	exit 0
}
trap stop TERM INT

# 3. The master first, then the bucket, which goes through the filer the server starts after it.
tries=0
until wget -qO- "http://$master/cluster/status" >/dev/null 2>&1; do
	kill -0 "$pid" 2>/dev/null || fail "weed server exited before its master answered"
	tries=$((tries + 1))
	[ "$tries" -lt 120 ] || fail "the master didn't answer within 120 s"
	sleep 1
done
tries=0
while :; do
	listing="$(printf 's3.bucket.list\n' | weed -logtostderr=true shell -master="$master" 2>&1 || true)"
	if printf '%s\n' "$listing" | grep -Eq '(^|[[:space:]])langfuse([[:space:]]|$)'; then
		break
	fi
	printf 's3.bucket.create -name langfuse\n' | weed -logtostderr=true shell -master="$master" >/dev/null 2>&1 || true
	kill -0 "$pid" 2>/dev/null || fail "weed server exited before the langfuse bucket was made"
	tries=$((tries + 1))
	[ "$tries" -lt 60 ] || fail "the langfuse bucket wasn't there after 60 tries"
	sleep 1
done

# 4. Ready: the health check needs this file and the master's answer.
touch "$ready"
echo "seaweedfs entrypoint: the langfuse bucket is ready"
wait "$pid"
