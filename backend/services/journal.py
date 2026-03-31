"""Trading journal service.

Records every analysis cycle -- regardless of whether a trade was placed --
to maintain a full audit trail for review and strategy improvement.
"""

import json
import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from models import JournalEntry

logger = logging.getLogger(__name__)


class TradingJournal:
    """Append-only trading journal backed by the ``journal_entries`` table."""

    def log_analysis(
        self,
        db: Session,
        symbol: str,
        price: float,
        indicators: dict,
        ai_provider: str,
        prompt: str,
        response: str,
        parsed_action: str,
        confidence: int,
        risk_passed: bool,
        risk_reason: str,
        trade_id: Optional[int] = None,
    ) -> JournalEntry:
        """Create a new journal entry capturing the full analysis context.

        Parameters
        ----------
        db : Session
            Active database session.
        symbol : str
            Trading pair (e.g. ``BTCUSDT``).
        price : float
            Spot price at time of analysis.
        indicators : dict
            Computed technical indicator values (serialised as JSON).
        ai_provider : str
            Which AI backend produced the analysis.
        prompt : str
            The prompt sent to the AI.
        response : str
            Raw AI response text.
        parsed_action : str
            Extracted action (``BUY`` / ``SELL`` / ``HOLD``).
        confidence : int
            Confidence score 0-100.
        risk_passed : bool
            Whether risk checks allowed the trade.
        risk_reason : str
            Human-readable risk check result.
        trade_id : int, optional
            ID of the trade opened as a result, if any.

        Returns
        -------
        JournalEntry
            The persisted journal row.
        """
        entry = JournalEntry(
            symbol=symbol,
            price_at_analysis=price,
            indicators=json.dumps(indicators, default=str),
            ai_provider=ai_provider,
            ai_prompt=prompt,
            ai_response=response,
            parsed_action=parsed_action,
            confidence=confidence,
            risk_check_passed=risk_passed,
            risk_check_reason=risk_reason,
            trade_id=trade_id,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)

        logger.info(
            "Journal entry #%s: %s %s conf=%d risk=%s trade=%s",
            entry.id,
            symbol,
            parsed_action,
            confidence,
            "PASS" if risk_passed else "FAIL",
            trade_id,
        )
        return entry

    def get_latest_entry(
        self, db: Session, symbol: Optional[str] = None
    ) -> Optional[JournalEntry]:
        """Return the most recent journal entry, optionally filtered by
        *symbol*.  Returns ``None`` when the journal is empty.
        """
        query = db.query(JournalEntry).order_by(JournalEntry.timestamp.desc())
        if symbol:
            query = query.filter(JournalEntry.symbol == symbol)
        return query.first()

    def get_entries(
        self, db: Session, limit: int = 50, offset: int = 0
    ) -> List[JournalEntry]:
        """Return journal entries in reverse chronological order with
        pagination support.
        """
        return (
            db.query(JournalEntry)
            .order_by(JournalEntry.timestamp.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
