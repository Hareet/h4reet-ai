# The Telegram stand-in's image (spec 000 plan §2 and §8; contracts/alerts.md §4.3; tasks.md T079): the in-network
# receiver that takes the place of Telegram's Bot API for dev's and dev-cpu's alerts in stand-in mode. Built from the
# repository root as its context, as the gateway and the probe are: in deploy/compose.yaml its build.context is `..`.
#
# The pinned base:python of deploy/images.lock, by digest, which the compose policy requires (plan §11). There is no
# `# syntax=` line: it would pull an unpinned frontend image. Nothing is installed: the base's own python3 runs the
# stand-in, which is standard library only. compose passes H4_BUILD_PROXY as the HTTP_PROXY and HTTPS_PROXY build
# arguments, as it does for the other built images; this build fetches nothing, and they never reach the image's
# environment.
FROM public.ecr.aws/docker/library/python:3.12.15-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1
# The one build step: the user the stand-in runs as, never root. No password, home, or login shell.
RUN useradd --uid 10001 --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin standin
# Root-owned and read-only to the stand-in's user; the container's root filesystem is read-only besides (compose.yaml).
COPY evals/standins/telegram_standin.py /app/telegram_standin.py
USER standin
# Isolated, with no bytecode written, on the port config/alerts.yaml's standin.telegram_base names.
CMD ["python3", "-I", "-B", "/app/telegram_standin.py", "--host", "0.0.0.0", "--port", "8080"]
