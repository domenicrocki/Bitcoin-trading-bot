# AI Crypto Trading Bot

Vollautomatischer KI-gestützter Kryptowährungs-Trading-Bot mit professionellem Dark-Theme Dashboard. Der Bot analysiert den Markt mithilfe von technischen Indikatoren und KI-Modellen (ChatGPT, Gemini oder Claude) und führt Trades automatisch über die Binance API aus.

---

## Features

### Trading
- **6 Trading-Paare:** BTC/USDT, ETH/USDT, BNB/USDT, XRP/USDT, SOL/USDT, TRX/USDT
- **Long & Short Positionen** vollständig unterstützt
- **Gestaffelte Take-Profits:** TP1 (25%), TP2 (50%), TP3 (25%) mit automatischem Break-Even Stop-Loss nach TP1
- **Analyse-Intervall:** Wählbar zwischen 15 Minuten und 1 Stunde
- **Manueller Analyse-Trigger** jederzeit über das Dashboard möglich

### KI-Analyse
- **OpenAI (ChatGPT)** — GPT-4o
- **Google Gemini** — Gemini 2.0 Flash
- **Anthropic (Claude)** — Claude Sonnet 4

Alle Provider erhalten denselben strukturierten Prompt mit Marktdaten, technischen Indikatoren, offenen Positionen und Kontoinformationen. Die KI antwortet mit einem standardisierten JSON-Signal (Action, Konfidenz, Entry, Stop-Loss, Take-Profits, Begründung).

### Technische Indikatoren
RSI (14) · MACD (12/26/9) · Bollinger Bands (20/2) · EMA (9/21/50/200) · SMA (20/50/200) · Stochastic RSI (14) · ADX (14) · ATR (14) · OBV · VWAP · Support/Resistance-Erkennung · Trend-Analyse

### Risikomanagement
| Regel | Standardwert |
|---|---|
| Max. Risiko pro Trade | 1% des Kapitals |
| Max. offene Positionen | 3 |
| Max. Tagesverlust | 5% (Warnung, kein Stopp) |
| Drawdown-Limit | 20% (blockiert neue Trades) |
| Mindest-Konfidenz | 70% |
| Mindest Risk-Reward-Ratio | 1:2 |
| Max. Hebel | 10x |

Alle Werte sind über das Dashboard anpassbar.

### Dashboard
- **Live Candlestick Chart** (TradingView Lightweight Charts) mit Volumen-Histogramm
- **Equity/P&L Kurve** — Gewinn- und Verlustverlauf über Zeit
- **Signal-Anzeige** — Action, Konfidenz-Balken, Preislevel, KI-Begründung
- **Offene Positionen** — Tabelle mit Live-P&L-Berechnung
- **Trade History** — Geschlossene Trades mit Pagination
- **Konto-Übersicht** — Balance, Equity, Win Rate, Drawdown, Tages-P&L
- **Bot Controls** — Start/Stop, Laufzeit, nächste Analyse
- **Einstellungen** — KI-Anbieter, Trading-Paar, Intervall, Risiko-Parameter, Hebel, TP-Verteilung
- **Echtzeit-Updates** über WebSocket mit Auto-Reconnect

--

## Tech Stack

| Bereich | Technologie |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy, SQLite |
| Frontend | React 18, TypeScript, Vite |
| Charts | TradingView Lightweight Charts, Recharts |
| State | Zustand, React Query |
| Exchange | python-binance (Binance API) |
| Analyse | pandas, pandas-ta |
| Scheduler | APScheduler |
| KI | openai, anthropic, google-generativeai |

---

## Installation

### Voraussetzungen
- Python 3.11 oder höher
- Node.js 18 oder höher
- npm 9 oder höher
- Binance-Konto mit API-Schlüssel
- Mindestens ein KI-API-Schlüssel (OpenAI, Gemini oder Anthropic)

### 1. Repository klonen

```bash
git clone https://github.com/domenicrocki/Bitcoin-trading-bot.git
cd Bitcoin-trading-bot
```

### 2. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
```

`.env` bearbeiten und API-Schlüssel eintragen:

```env
# Binance (Testnet zum Testen empfohlen)
BINANCE_API_KEY=dein_binance_api_key
BINANCE_API_SECRET=dein_binance_api_secret
BINANCE_TESTNET=true

# Mindestens einen KI-Anbieter konfigurieren
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Backend installieren und starten

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Das Backend läuft auf `http://localhost:8000`. Die SQLite-Datenbank wird beim ersten Start automatisch erstellt.

### 4. Frontend installieren und starten

```bash
cd frontend
npm install
npm run dev
```

Das Dashboard öffnet sich auf `http://localhost:5173`.

### 5. Bot verwenden

1. Dashboard im Browser öffnen (`http://localhost:5173`)
2. Unter **Einstellungen** den gewünschten KI-Anbieter, das Trading-Paar und das Analyse-Intervall wählen
3. Risiko-Parameter nach Bedarf anpassen
4. **Start Bot** klicken — der Bot beginnt automatisch mit der Analyse im gewählten Intervall
5. Alternativ: **Analyse Triggern** für eine sofortige Analyse

---

## Projektstruktur

```
Bitcoin-trading-bot/
├── .env.example                 # Vorlage für Umgebungsvariablen
├── backend/
│   ├── main.py                  # FastAPI App, WebSocket, Scheduler
│   ├── config.py                # Konfiguration aus .env
│   ├── database.py              # SQLite + SQLAlchemy
│   ├── models.py                # Datenbank-Modelle
│   ├── schemas.py               # API Request/Response Schemas
│   ├── routers/                 # REST API Endpunkte
│   │   ├── trading.py           # Bot Start/Stop/Status
│   │   ├── settings.py          # Einstellungen lesen/ändern
│   │   ├── positions.py         # Offene Positionen, Trade History
│   │   ├── analysis.py          # Analyse-Ergebnisse, Journal
│   │   └── account.py           # Konto-Daten, Equity Curve, Candles
│   ├── services/                # Business Logic
│   │   ├── trading_engine.py    # Zyklus-Orchestrator
│   │   ├── exchange.py          # Binance API Wrapper
│   │   ├── technical_analysis.py# Alle technischen Indikatoren
│   │   ├── risk_manager.py      # Risiko-Prüfungen
│   │   ├── trade_executor.py    # Order-Ausführung
│   │   ├── journal.py           # Trading-Journal
│   │   └── websocket_manager.py # Echtzeit-Broadcasts
│   └── ai/                      # KI-Analyse-Layer
│       ├── base.py              # Abstrakte Provider-Klasse
│       ├── openai_provider.py   # ChatGPT Integration
│       ├── gemini_provider.py   # Google Gemini Integration
│       ├── anthropic_provider.py# Claude Integration
│       ├── prompt_builder.py    # Strukturierter Analyse-Prompt
│       └── response_parser.py   # KI-Antwort Parsing
└── frontend/
    └── src/
        ├── components/          # React Komponenten
        │   ├── Dashboard.tsx    # Haupt-Grid-Layout
        │   ├── CandlestickChart.tsx # Live Chart
        │   ├── EquityCurve.tsx  # P&L Kurve
        │   ├── SettingsPanel.tsx # Einstellungen
        │   ├── SignalCard.tsx   # KI-Signal Anzeige
        │   ├── PositionsTable.tsx # Offene Positionen
        │   ├── TradeHistory.tsx # Trade-Verlauf
        │   ├── AccountSummary.tsx # Konto-Übersicht
        │   └── BotControls.tsx  # Bot-Steuerung
        ├── api/                 # Axios Client + React Query Hooks
        ├── ws/                  # WebSocket Hook
        ├── store/               # Zustand State Management
        └── types/               # TypeScript Interfaces
```

---

## API Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/bot/start` | Bot starten |
| `POST` | `/api/bot/stop` | Bot stoppen |
| `GET` | `/api/bot/status` | Bot-Status abrufen |
| `GET` | `/api/settings` | Einstellungen lesen |
| `PUT` | `/api/settings` | Einstellungen ändern |
| `GET` | `/api/account` | Konto-Übersicht |
| `GET` | `/api/account/equity-curve` | Equity-Verlauf |
| `GET` | `/api/positions` | Offene Positionen |
| `GET` | `/api/trades` | Trade History |
| `GET` | `/api/analysis/latest` | Letzte Analyse |
| `POST` | `/api/analysis/trigger` | Analyse manuell auslösen |
| `GET` | `/api/candles` | Kerzen-Daten |
| `GET` | `/api/journal` | Trading-Journal |
| `WS` | `/ws` | Echtzeit-Updates |

---

## Hinweise

- **Testnet empfohlen:** Setze `BINANCE_TESTNET=true` in der `.env` um mit Testgeld zu handeln bevor du echtes Kapital einsetzt.
- **Risiko:** Kryptowährungshandel ist hochriskant. Dieser Bot ist ein Werkzeug — keine Garantie für Gewinne. Nutze ihn auf eigene Verantwortung.
- **KI-Kosten:** Jede Analyse erzeugt einen API-Call beim gewählten KI-Anbieter. Bei 15-Minuten-Intervall sind das ~96 Calls pro Tag.
