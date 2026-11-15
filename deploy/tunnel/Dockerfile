# The tunnel's image, both ends (spec 001 contracts/tunnel.md §2 and §3; research.md R-11): Ubuntu's OpenSSH on the
# pinned base:ubuntu of deploy/images.lock, by digest, which the compose policy requires (plan §11). The contract named
# Alpine's; no Alpine base is pinned, and pinning one is the Author's own step, so this image uses the base the lock
# already holds (plan.md §16, group 5's departures). There is no `# syntax=` line: it would pull an unpinned frontend
# image.
#
# The laptop builds it for the `tunnel` service, from this folder alone; the Author's release builds it for the tunnel
# end's `tunnel-end`, which pulls it from ECR by digest. The build fetches Ubuntu's packages from its archive, so it runs
# on the Author's engine, not the agents' (deploy/tunnel/test_tunnel.py skips there).
FROM public.ecr.aws/docker/library/ubuntu:24.04@sha256:534baea6a22c03a63003dbc8dbe78fe34bc0d7e595d9a9dc9834884ff530eb55
# OpenSSH's server and client, and nothing they only recommend. The package's own host keys go: the image holds none,
# and the tunnel end's comes from Parameter Store at boot. The one user, `tunnel`, with no password and no login, and
# not locked, since sshd refuses a locked account's key; its uid is the one write_env.py gives the key files.
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openssh-server openssh-client \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /etc/ssh/ssh_host_* \
 && useradd --uid 10001 --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin tunnel \
 && usermod -p '*' tunnel \
 && install -d -m 0755 /etc/ssh/h4
# /etc/ssh/h4 made first, 0755: a COPY --chmod into a missing directory makes it 0644 (T166's dry run).
COPY --chmod=0644 sshd_config ssh_config ssh_config_admin /etc/ssh/h4/
COPY --chmod=0755 entrypoint.sh /usr/local/bin/h4-tunnel
# ssh runs its LocalCommand with $SHELL, and the user's own shell is nologin.
ENV SHELL=/bin/sh
USER tunnel
ENTRYPOINT ["/usr/local/bin/h4-tunnel"]
