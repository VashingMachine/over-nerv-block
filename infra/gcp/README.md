# Google Cloud deployment bootstrap

Sprint 00 deploys one same-origin Cloud Run service with two containers:

- nginx serves the immutable Vite build on port 8080;
- FastAPI is a private sidecar on localhost port 8081;
- nginx proxies `/api/*` to the sidecar;
- preview services are named from the candidate commit;
- staging re-tags and deploys the already-reviewed container digests rather than rebuilding them.

Cloud Run uses request-based billing, zero minimum instances, and a maximum of two instances for this early stage. A billing-enabled Google Cloud project is still required.

## Required GitHub variables

Configure these as repository variables, not secrets:

| Variable                         | Example                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                 | `my-rhythm-game`                                                                             |
| `GCP_REGION`                     | `europe-west1`                                                                               |
| `GCP_ARTIFACT_REPOSITORY`        | `over-nerv-block`                                                                            |
| `GCP_DEPLOY_SERVICE_ACCOUNT`     | `github-deployer@my-rhythm-game.iam.gserviceaccount.com`                                     |
| `GCP_RUNTIME_SERVICE_ACCOUNT`    | `over-nerv-block-runtime@my-rhythm-game.iam.gserviceaccount.com`                             |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/123456789/locations/global/workloadIdentityPools/github/providers/over-nerv-block` |

No long-lived service-account key is used. GitHub obtains a short-lived identity through Workload Identity Federation.

## One-time bootstrap

Run these commands in Google Cloud Shell after replacing `YOUR_PROJECT_ID`. They create only the deployment runway; later upload/storage/queue resources belong to their introducing stories.

```bash
export ONB_PROJECT_ID="YOUR_PROJECT_ID"
export ONB_REGION="europe-west1"
export ONB_REPOSITORY="over-nerv-block"
export ONB_GITHUB_REPOSITORY="VashingMachine/over-nerv-block"
export ONB_POOL="github"
export ONB_PROVIDER="over-nerv-block"
export ONB_DEPLOYER="github-deployer"
export ONB_RUNTIME="over-nerv-block-runtime"

gcloud config set project "$ONB_PROJECT_ID"
gcloud services enable \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  sts.googleapis.com

gcloud artifacts repositories create "$ONB_REPOSITORY" \
  --location "$ONB_REGION" \
  --repository-format docker

gcloud iam service-accounts create "$ONB_DEPLOYER"
gcloud iam service-accounts create "$ONB_RUNTIME"

for role in roles/artifactregistry.writer roles/run.admin; do
  gcloud projects add-iam-policy-binding "$ONB_PROJECT_ID" \
    --member "serviceAccount:$ONB_DEPLOYER@$ONB_PROJECT_ID.iam.gserviceaccount.com" \
    --role "$role"
done

gcloud iam service-accounts add-iam-policy-binding \
  "$ONB_RUNTIME@$ONB_PROJECT_ID.iam.gserviceaccount.com" \
  --member "serviceAccount:$ONB_DEPLOYER@$ONB_PROJECT_ID.iam.gserviceaccount.com" \
  --role roles/iam.serviceAccountUser

gcloud iam workload-identity-pools create "$ONB_POOL" \
  --location global

gcloud iam workload-identity-pools providers create-oidc "$ONB_PROVIDER" \
  --location global \
  --workload-identity-pool "$ONB_POOL" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository=='$ONB_GITHUB_REPOSITORY'"

ONB_PROJECT_NUMBER="$(gcloud projects describe "$ONB_PROJECT_ID" \
  --format='value(projectNumber)')"

gcloud iam service-accounts add-iam-policy-binding \
  "$ONB_DEPLOYER@$ONB_PROJECT_ID.iam.gserviceaccount.com" \
  --member "principalSet://iam.googleapis.com/projects/$ONB_PROJECT_NUMBER/locations/global/workloadIdentityPools/$ONB_POOL/attribute.repository/$ONB_GITHUB_REPOSITORY" \
  --role roles/iam.workloadIdentityUser
```

Copy the provider resource name returned by:

```bash
gcloud iam workload-identity-pools providers describe "$ONB_PROVIDER" \
  --location global \
  --workload-identity-pool "$ONB_POOL" \
  --format name
```

Add all six variables with `gh variable set`, then run the **Deploy** workflow against the candidate branch with target `preview`. After both independent reviews pass, run it from `main` with target `staging` and the accepted preview SHA as `candidate_sha`.

## Rollback and cleanup

- Staging rollback: direct Cloud Run traffic to the preceding revision.
- Rejected preview cleanup: delete only its exact `onb-s00-<12-character-sha>` service.
- Artifact cleanup: retain accepted digests; remove only tags/digests proven unreferenced by preview or staging.

References: [Cloud Run multi-container services](https://cloud.google.com/run/docs/deploying#sidecars), [Google authentication for GitHub Actions](https://github.com/google-github-actions/auth), and [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation).
