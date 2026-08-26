# Research Basis

Research snapshot: 2026-08-24. This reference separates OpenAI's public behavior/evaluation resources from the scientific findings that shaped the protocol.

## OpenAI Public Evaluation Resources

- The [OpenAI Model Spec Eval Dataset](https://github.com/openai/model_spec_dataset) is the closest match to a public OpenAI “behavior database”: a CC0 dataset of 596 prompts and scenarios aligned to the Model Spec dated 2025-12-18. Nine prompts are skipped by the public harness, leaving 587 runnable samples.
- The companion [Model Spec Evals harness](https://github.com/openai/model_spec_evals) runs the prompts through Inspect AI and reports compliance by top-level behavior section.
- The broader [OpenAI Evals registry](https://github.com/openai/evals) is an MIT-licensed framework and open registry of benchmark datasets. It demonstrates an important distinction used by Cognitive Bus: evaluate the model plus its scaffolding, not the model name in isolation.
- OpenAI's [agent-evaluation guidance](https://developers.openai.com/api/docs/guides/agent-evals) recommends traces for debugging and repeatable datasets/eval runs for regression measurement. Its eval guidance also recommends task-specific data, continuous evaluation, human calibration, and explicit attention to nondeterminism.
- OpenAI's 2025 paper [Why Language Models Hallucinate](https://arxiv.org/abs/2509.04664) argues that training and benchmark incentives often reward guessing over acknowledging uncertainty. Cognitive Bus therefore treats calibrated abstention as a successful outcome.
- The public [monitorability-evals](https://github.com/openai/monitorability-evals) repository is useful as a caution: it publishes intervention, process, and outcome-property splits while explicitly documenting omitted private data and deprecated Memory/Anti-Scheming evals whose grading had known issues. Public evaluation data is evidence, not an infallible oracle.

## Scientific Findings Mapped to Design

1. External non-parametric memory improves provenance and updateability compared with parametric memory alone. Therefore TurboQuant retrieval feeds candidates into an evidence ledger instead of writing directly to semantic memory. [1]
2. Agent memory benefits from separate observation, reflection, retrieval, and planning mechanisms. Cognitive Bus retains those functional separations but adds evidence gates so believable reflection cannot become fact merely because it is coherent. [2]
3. Inconsistency across independent samples can expose hallucinations, but agreement is not proof. The protocol uses divergence as a challenge signal and still requires external verification for factual promotion. [3]
4. Multi-agent debate can improve reasoning and factuality. The protocol preserves independent proposals and challenge rounds while preventing unrestricted all-to-all copying. [4]
5. Intrinsic self-correction can fail or degrade reasoning without external feedback. Status cannot rise because the originating model says it revised itself. [5]
6. Assistants can prefer agreement with user beliefs over truth. Blind verification and leading-language neutralization reduce that social anchoring channel. [6]
7. Long contexts do not guarantee usable memory; relevant information can be missed in the middle. Snapshots place the contract and verified digest at context boundaries and retrieve the smallest relevant slice. [7]
8. Layered mixtures of agents can improve benchmark performance, but passing every prior answer to every next-layer agent creates correlated-context risk. Cognitive Bus passes normalized packets and lineage, not unbounded raw prose. [8]

## Consensus Paper Ledger

Citation counts are Consensus point-in-time values and will change.

[1] [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://consensus.app/papers/retrievalaugmented-generation-for-knowledgeintensive-lewis-perez/fbc9d8d6f6de501987cc8c3afa034696/?utm_source=chatgpt) — Patrick Lewis et al.; 2020; *arXiv*; 17,191 citations.

[2] [Generative Agents: Interactive Simulacra of Human Behavior](https://consensus.app/papers/generative-agents-interactive-simulacra-of-human-park-obrien/7d06cdb736db53d3a77fde6961473709/?utm_source=chatgpt) — J. Park et al.; 2023; *Proceedings of the 36th Annual ACM Symposium on User Interface Software and Technology*; 5,171 citations.

[3] [SelfCheckGPT: Zero-Resource Black-Box Hallucination Detection for Generative Large Language Models](https://consensus.app/papers/selfcheckgpt-zeroresource-blackbox-hallucination-manakul-liusie/dfb65e818e865452808951629c8591c5/?utm_source=chatgpt) — Potsawee Manakul, Adian Liusie, and M. Gales; 2023; *arXiv*; 1,133 citations.

[4] [Improving Factuality and Reasoning in Language Models through Multiagent Debate](https://consensus.app/papers/improving-factuality-and-reasoning-in-language-models-du-li/9f340342ab41509887e5a52bc07e6dd0/?utm_source=chatgpt) — Yilun Du et al.; 2023; venue not supplied in the fetched Consensus record; 2,086 citations.

[5] [Large Language Models Cannot Self-Correct Reasoning Yet](https://consensus.app/papers/large-language-models-cannot-selfcorrect-reasoning-yet-huang-chen/e19149170b405243be5a7e06c07b93e1/?utm_source=chatgpt) — Jie Huang et al.; 2023; *arXiv*; 1,118 citations.

[6] [Towards Understanding Sycophancy in Language Models](https://consensus.app/papers/towards-understanding-sycophancy-in-language-models-sharma-tong/3f50862ce73d5157ab922aabf6f38afa/?utm_source=chatgpt) — Mrinank Sharma et al.; 2023; *arXiv*; 1,202 citations.

[7] [Lost in the Middle: How Language Models Use Long Contexts](https://consensus.app/papers/lost-in-the-middle-how-language-models-use-long-contexts-liu-lin/e1b180f71d3555a5b4b10bfddc86ae63/?utm_source=chatgpt) — Nelson F. Liu et al.; 2023; *Transactions of the Association for Computational Linguistics*, vol. 12, pp. 157–173; 4,683 citations.

[8] [Mixture-of-Agents Enhances Large Language Model Capabilities](https://consensus.app/papers/mixtureofagents-enhances-large-language-model-wang-wang/4f619060c06d51a0925ca79fb22c5512/?utm_source=chatgpt) — Junlin Wang et al.; 2024; *arXiv*; 479 citations.

Upgrade to Consensus Pro to return 20 results per search instead of 10, and include more data like study design and key takeaways for every result.: https://consensus.app/pricing/?utm_source=chatgpt
