# Sprint 05 model, runtime, and license inventory

Assessment date: 2026-07-21

Product assumption: this project may become closed-source or commercial. A runtime, model checkpoint, and its training/data provenance are separate approval surfaces.

| Candidate                                                    | Code/runtime license                                 | Weights/data position                                                                                       | Browser/bundle position                                                                                           | Sprint 05 decision                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| In-repo `quality-dsp-v1`                                     | Repository-owned TypeScript; no new dependency       | No weights; owned deterministic fixtures only                                                               | Existing worker bundle; measured in current production path                                                       | **Selected** for implementation and benchmark                                                                |
| [`fft.js`](https://github.com/indutny/fft.js)                | Repository declares MIT                              | No weights or model data                                                                                    | Browser-bundle-capable JavaScript FFT, but duplicates the measured in-repo transform                              | **Rejected**: the accepted in-repo FFT avoids a dependency and already meets quality/performance gates       |
| [Meyda](https://github.com/meyda/meyda)                      | Repository declares MIT                              | No weights or model data                                                                                    | Browser/Web Audio feature extraction; does not supply complete tempo, phase, beat, or downbeat tracking           | **Rejected**: no demonstrated quality or maintenance win over the existing bounded feature path              |
| [Essentia.js](https://github.com/MTG/essentia.js)            | Repository identifies AGPL-3.0                       | Model rights would still require separate review                                                            | Browser-capable WebAssembly, but adds a substantial runtime and evolving API surface                              | **Rejected by policy** without explicit user approval                                                        |
| [madmom](https://github.com/CPJKU/madmom)                    | Source is BSD unless noted                           | Repository states model/data files are CC BY-NC-SA 4.0 unless noted                                         | Python/Cython, not a browser runtime                                                                              | **Rejected** for commercial-policy and platform reasons                                                      |
| [Beat This!](https://github.com/CPJKU/beat_this)             | Repository states code and published weights are MIT | Repository warns some training files are copyrighted or limited-license; product impact requires assessment | PyTorch model; no accepted browser checkpoint/runtime/performance artifact in this repository                     | **Benchmark-ineligible for this sprint** pending conversion, provenance, bundle, memory, and device evidence |
| [librosa](https://github.com/librosa/librosa)                | Repository declares ISC                              | No bundled weights; comparator corpus rights would remain separate                                          | Python analysis library, not part of the browser runtime                                                          | **Private research comparator only**; rejected as a product/runtime dependency under browser-only policy     |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | MIT runtime                                          | Each model/checkpoint remains separately licensed                                                           | Official web runtime supports WASM/WebGPU and reduced builds, but adds runtime/model bytes and device variability | **Runtime candidate only**; not added without an approved checkpoint and measured quality win                |

## Decision

No external runtime or checkpoint is bundled in Sprint 05. The in-repo DSP variant is the only candidate that currently satisfies browser execution, deterministic ownership, bundle, privacy, and license gates. This is not a claim that DSP is universally more accurate than modern research models; it is the only candidate eligible for product selection under the current evidence.

## Reconsideration gate

An external model can enter a later benchmark only with all of the following committed before selection:

1. Exact code/runtime/weights licenses and training-data risk note.
2. Reproducible conversion and model hash.
3. Browser-worker integration with no external fetch or upload.
4. Compressed bundle and peak-memory measurements.
5. Desktop and representative mobile latency measurements.
6. Same-corpus beat/downbeat metrics showing a material gain over `quality-dsp-v1`.
7. Stable cancellation, timeout, malformed-output, and fallback behavior.
