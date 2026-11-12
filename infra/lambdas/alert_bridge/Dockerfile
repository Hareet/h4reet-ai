# The image of h4-alert-bridge, h4-alerts' Telegram half (spec 001; contracts/aws-alerts.md §1, §2; tasks.md T035).
# Its base is AWS's python3.14 Lambda base for arm64, by the digest deploy/images.lock pins as base:lambda-python (the
# Author's resolve, 2026-11-11), which the compose policy requires and infra/lambdas/test_images.py holds this file to.
# Built from this folder as its context, for linux/arm64. There is no `# syntax=` line, which would pull an unpinned
# frontend image; nothing is installed or fetched, and nothing runs at build.
FROM public.ecr.aws/lambda/python:3.14-arm64@sha256:9ffc23f871c4db05f101f457e1742655f7629459bd3623c0ce60a65a01872904
# The one module, into the runtime's task root, with its handler() as the entry.
COPY bridge.py ${LAMBDA_TASK_ROOT}/
CMD ["bridge.handler"]
