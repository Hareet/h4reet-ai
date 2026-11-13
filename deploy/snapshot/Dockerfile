# The public view's image (spec 001 tasks.md T137; contracts/public-view.md §1 and §2; plan.md §16, "Group 10, as
# built"): deploy/scripts/snapshot_sink.py and snapshot_publisher.py, the standard library alone, on the pinned
# base:python of deploy/images.lock, by digest, which the compose policy requires (plan §11). Nothing is fetched at
# build: the two files and the base. The release builds it once, from the repository's root, for linux/amd64 and
# linux/arm64, for the tunnel end's snapshot-sink and EC2's ec2-snapshot-publisher, by its digest; the laptop's
# snapshot-publisher builds it from the tree. There is no `# syntax=` line: it would pull an unpinned frontend.
FROM public.ecr.aws/docker/library/python:3.12.15-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1
COPY --chmod=0644 deploy/scripts/snapshot_sink.py deploy/scripts/snapshot_publisher.py /app/
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001:10001
ENTRYPOINT ["python3", "-I", "-B"]
