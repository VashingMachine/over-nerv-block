from importlib.metadata import distributions
import re


FORBIDDEN_LICENSE = re.compile(
    r"(?:^|[^L])GPL|AGPL|SSPL|NON[- ]?COMMERCIAL|UNLICENSED",
    re.IGNORECASE,
)

def main() -> None:
    findings: list[str] = []
    checked = 0

    for distribution in distributions():
        name = distribution.metadata["Name"]
        if name is None:
            continue

        checked += 1
        declared = (
            distribution.metadata.get("License-Expression")
            or distribution.metadata.get("License")
            or ""
        )
        classifiers = " ".join(
            distribution.metadata.get_all("Classifier") or []
        )
        description = f"{declared} {classifiers}".strip()
        if not description:
            findings.append(f"{name}: no declared license")
        elif FORBIDDEN_LICENSE.search(description):
            findings.append(f"{name}: license requires explicit approval")

    if findings:
        raise RuntimeError(
            "Python license policy failed without emitting license text:\n"
            + "\n".join(sorted(findings))
        )

    print(f"Python license policy passed for {checked} installed packages.")


if __name__ == "__main__":
    main()
