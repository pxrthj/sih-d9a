from typing import List, Tuple
from app.schemas.scan import ExtractedData, Violation


def check_compliance_rules(extracted: ExtractedData) -> Tuple[List[Violation], str]:
    """
    Evaluates Legal Metrology compliance rules in plain Python.
    Checks mandatory declarations: MRP, Net Quantity, and Consumer Care details.

    Returns:
        Tuple[List[Violation], str]: (violations_list, status_string)
    """
    violations: List[Violation] = []

    # Rule 1: Check Maximum Retail Price (MRP)
    if extracted.mrp is None or not extracted.mrp.value or not extracted.mrp.value.strip():
        violations.append(
            Violation(
                field="mrp",
                issue="missing",
                rule_ref="Rule-PLACEHOLDER-1"
            )
        )

    # Rule 2: Check Net Quantity
    if (
        extracted.net_quantity is None
        or not extracted.net_quantity.value
        or not extracted.net_quantity.value.strip()
    ):
        violations.append(
            Violation(
                field="net_quantity",
                issue="missing",
                rule_ref="Rule-PLACEHOLDER-2"
            )
        )

    # Rule 3: Check Consumer Care Details
    if extracted.consumer_care is None or not extracted.consumer_care.strip():
        violations.append(
            Violation(
                field="consumer_care",
                issue="missing",
                rule_ref="Rule-PLACEHOLDER-3"
            )
        )

    # Determine status based on violations
    status = "flagged" if len(violations) > 0 else "compliant"

    return violations, status
