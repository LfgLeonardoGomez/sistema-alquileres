"""Payment purpose derivation (design D3, D42; payment-tracking spec
"Payment Purpose Is Derived From `paid_on`, Never Stored").

The fourth service module, added deliberately against D3's stated
reservation of `services/` for the three modules with real logic
(`reservations.py`, `dashboard.py`, `clients.py`): purpose is a real
derivation, not a plain insert/select, so it earns its own module rather
than living inline in the router (design D42).

`assign_purposes()` is a pure function -- no session, no query. It takes
whatever `Payment` rows the caller already has in hand and returns a
`{payment.id: purpose}` mapping; it never fetches rows itself. This keeps
the list endpoint's read path at zero extra queries and the create
endpoint's write path at exactly one extra `SELECT` (`app/api/routers/payments.py`).
"""

import uuid
from collections.abc import Sequence

from app.models.payment import Payment


def assign_purposes(payments: Sequence[Payment]) -> dict[uuid.UUID, str]:
    """Among the given payments, the earliest positive one by `paid_on`
    is the deposit ("Seña"); every other positive one is a plain payment
    ("Pago"); a non-positive amount (a refund, by design D7's sign
    discriminator) is never a deposit/payment candidate.

    Ordering key: `(paid_on, created_at, id)`. `paid_on` is the rule
    (D42); `created_at` breaks a tie between two payments recorded on the
    same day; `id` is the final, arbitrary-but-stable tie-break so the
    label never flips between two identical requests.
    """
    ordered = sorted(payments, key=lambda payment: (payment.paid_on, payment.created_at, payment.id))

    purposes: dict[uuid.UUID, str] = {}
    deposit_assigned = False
    for payment in ordered:
        if payment.amount <= 0:
            purposes[payment.id] = "refund"
            continue
        if not deposit_assigned:
            purposes[payment.id] = "deposit"
            deposit_assigned = True
        else:
            purposes[payment.id] = "payment"
    return purposes
