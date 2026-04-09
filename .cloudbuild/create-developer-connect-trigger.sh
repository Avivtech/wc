#!/usr/bin/env bash

set -euo pipefail

REGION="${REGION:-europe-west1}"
SERVICE_NAME="${SERVICE_NAME:-wc}"
AR_HOSTNAME="${AR_HOSTNAME:-europe-west1-docker.pkg.dev}"
AR_REPOSITORY="${AR_REPOSITORY:-wc}"
TRIGGER_NAME="${TRIGGER_NAME:-wc-main}"
BRANCH_PATTERN="${BRANCH_PATTERN:-^main$}"
DESCRIPTION="${DESCRIPTION:-Deploy ${SERVICE_NAME} to Cloud Run from Developer Connect}"
BUILD_CONFIG="${BUILD_CONFIG:-cloudbuild.yaml}"
GIT_REPOSITORY_LINK="${GIT_REPOSITORY_LINK:-}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-}"
INCLUDED_FILES="${INCLUDED_FILES:-**}"
IGNORED_FILES="${IGNORED_FILES:-node_modules/**,.git/**,.env,.env.*}"

if [[ -z "${GIT_REPOSITORY_LINK}" ]]; then
  echo "GIT_REPOSITORY_LINK is required." >&2
  echo "Example:" >&2
  echo "  projects/PROJECT_ID/locations/${REGION}/connections/CONNECTION/gitRepositoryLinks/REPO_LINK" >&2
  exit 1
fi

CMD=(
  gcloud beta builds triggers create developer-connect
  "--name=${TRIGGER_NAME}"
  "--region=${REGION}"
  "--description=${DESCRIPTION}"
  "--git-repository-link=${GIT_REPOSITORY_LINK}"
  "--branch-pattern=${BRANCH_PATTERN}"
  "--build-config=${BUILD_CONFIG}"
  "--included-files=${INCLUDED_FILES}"
  "--ignored-files=${IGNORED_FILES}"
  "--substitutions=_SERVICE_NAME=${SERVICE_NAME},_REGION=${REGION},_AR_HOSTNAME=${AR_HOSTNAME},_AR_REPOSITORY=${AR_REPOSITORY}"
)

if [[ -n "${SERVICE_ACCOUNT}" ]]; then
  CMD+=("--service-account=${SERVICE_ACCOUNT}")
fi

printf 'Running:'
for ARG in "${CMD[@]}"; do
  printf ' %q' "${ARG}"
done
printf '\n'

"${CMD[@]}"
