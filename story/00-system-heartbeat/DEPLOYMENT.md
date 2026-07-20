# Sprint 00 deployment

Status: pipeline implemented; cloud identity and first preview execution pending.

## Environments

| Environment | Resource                                                       | State          |
| ----------- | -------------------------------------------------------------- | -------------- |
| Local       | Docker Compose, configurable `WEB_PORT`                        | Verified       |
| Preview     | immutable `onb-s00-<candidate-sha>` Cloud Run service          | Pending        |
| Staging     | `over-nerv-block-staging` promoted from reviewed image digests | Pending        |
| Production  | not part of Sprint 00                                          | Not applicable |

The Cloud Run service contains an nginx ingress container and a FastAPI sidecar. Both images are tagged with the full source SHA in Artifact Registry. The public site and API remain same-origin, and the API sidecar is reachable only through nginx on localhost.

Preview deployment runs remote verification, deployed desktop/mobile E2E, a health smoke test, and evidence capture. Staging promotion adds the accepted commit tag to the already-reviewed image digests and runs the same smoke/E2E path without rebuilding an unpinned branch.

## Required external configuration

The six non-secret GitHub variables and least-privilege Workload Identity bootstrap are documented in `infra/gcp/README.md`. No Google Cloud project or identity is connected yet.

## Rollback

- Rejected preview: delete only its exact SHA-named Cloud Run service.
- Staging: route traffic to the preceding healthy revision.
- Images: retain accepted digests and remove only artifacts proven unreferenced.
