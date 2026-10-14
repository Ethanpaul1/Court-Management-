<div align="center">

# 🏡 Lemayian Court — Estate Manager

**A complete resident & levy management dashboard for Lemayian Court estate.**

Track residents, post monthly levies, record payments, monitor special projects, and generate collection reports — with authenticated multi-estate sync or an offline demo mode.

![React](https://img.shields.io/badge/React-19-blue?logo=react&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow?logo=javascript&logoColor=white)
![Create React App](https://img.shields.io/badge/Create%20React%20App-5.0.1-09D3AC?logo=create-react-app&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## ✨ Features

| Module | What it does |
| --- | --- |
| **📊 Dashboard** | At-a-glance overview of total collections, outstanding balances, credits, collection rate, arrears, and a 6-month payment chart. |
| **👥 Residents & Statements** | Manage the estate registry (units A1–A8) and open a live per-resident ledger — every charge, payment, and running balance, with receipts. |
| **💳 Payments** | Post the monthly levy to all residents in one click, record individual payments, and browse a 50-entry payment history. |
| **🔨 Projects** | Fund special projects (e.g., the GateHouse) with funding targets, progress bars, and per-resident contribution logs. |
| **📈 Reports** | Monthly levy vs. collections bar charts, per-month breakdowns, collection rates, and a full resident payment summary. |
| **⚙️ Settings** | Download or restore JSON backups, and reset the workspace to presentation-ready demo data. |
| **🎓 App Tour** | A guided onboarding tour that walks new users through every module. |

**Key behaviours**
- 🔁 **Live ledgers** — running balances recalculate instantly as you add or delete transactions.
- 💾 **Offline-first** — all data is persisted in your browser's `localStorage`; no server or account required.
- 💵 **KES formatting** — amounts are formatted with Kenyan number/currency conventions.
- 🧾 **Exports and print** — export statements, payment history, and reports to CSV; statements open in a clean print layout.
- 📱 **M-Pesa references** — capture transaction codes on payments and preserve them in receipts and CSV exports.
- 🔔 **Arrears reminder log** — record WhatsApp, call, SMS, email, letter, or visit follow-ups with dates and notes.
- 🔎 **Statement filters** — search by description, date, or amount and narrow a statement to a date range.
- 🗒️ **Resident notes** — keep internal notes on residents without displaying them in statements.
- 🛡️ **Safety checks** — duplicate levy warnings, overpayment confirmations, required unit numbers, and styled confirmations for destructive actions.

---

## 🛠️ Tech Stack

| Technology | Purpose |
| --- | --- |
| [React 19](https://react.dev/) | UI library |
| [Create React App 5](https://create-react-app.dev/) | Build tooling & dev server |
| JavaScript (ES2020+) | Application logic |
| `localStorage` | Client-side data persistence |
| [Inter](https://rsms.me/inter/) | UI font family |
| Node.js HTTP API | Authentication, estate-scoped sync, backups, and reminder logging |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **18+** (recommended LTS)
- npm (bundled with Node.js)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/lemayian-court.git
cd lemayian-court

# 2. Install dependencies
npm install
```

### Running the app

```bash
npm start
```

Runs the app in development mode at [http://localhost:3000](http://localhost:3000). The page reloads when you make changes, and lint errors are shown in the console.

### Running the backend

In a second terminal:

```powershell
Copy-Item .env.example .env
npm run server
```

The API runs at `http://localhost:4000`. Create an account in the app to use authenticated estate sync. The local API stores development data in `server/data.json`, which is ignored by Git. Use a managed database and HTTPS before deploying to multiple users.

For frontend deployments, set `REACT_APP_API_URL` to the deployed API URL. For backend deployments, set a long random `JWT_SECRET`, `CORS_ORIGIN`, `PORT`, and a persistent `DATA_FILE` or replace the JSON store with a database adapter.

### Building for production

```bash
npm run build
```

Builds the app for production into the `build/` folder — minified, hashed, and optimized for deployment.

### Running tests

```bash
npm test
```

Launches the test runner in interactive watch mode.

---

## 📁 Project Structure

```
lemayian-court/
├── public/
│   ├── index.html          # HTML entry with SEO/social metadata
│   ├── manifest.json       # PWA app manifest & branding
│   ├── favicon.ico         # Site icon
│   └── robots.txt          # Search-engine crawling rules
├── src/
│   ├── index.js            # React entry point
│   ├── index.css           # Global base styles
│   └── App.jsx             # The entire application
├── server/
│   ├── index.js            # Authenticated estate API
│   └── .gitignore          # Keeps local API data out of Git
├── package.json            # Dependencies & scripts
├── TODO.md                 # Development checklist
└── README.md               # You are here
```

---

## 📖 Usage Guide

1. **Dashboard** — opens by default. Monitor total collected, outstanding arrears, and the estate-wide collection rate.
2. **Residents** — click any resident's **Statement** to see their live ledger, record payments, post charges, or delete entries. Use **Add Resident** to register a new unit.
3. **Payments**
   - *Monthly Levy* — select the residents to bill, set the security & "others" amounts, and post to everyone in one click.
   - *Single Payment* — record an individual payment against a resident.
   - *History* — review the latest payments across the estate.
4. **Projects** — create a project (e.g., *GateHouse – 1st Estimate*, target **KES 400,000**), then log resident contributions and watch the progress bar fill.
5. **Reports** — switch financial years, review monthly levies vs. collections, print the report, or export it as CSV.
6. **Settings** — download a JSON backup before moving computers, restore a previous backup, or reset to the seeded demo state before a presentation.

> 💡 Press **🎓 App Tour** in the sidebar anytime to replay the guided onboarding.

---

## 💾 Data & Storage

- **Persistence** — every change is saved automatically to your browser's `localStorage` under keys prefixed with `lc-`. Closing the tab **does not** lose your data.
- **Seed data** — on first launch the app seeds 8 residents (units A1–A8), a full 2025 levy ledger, and two GateHouse project entries so the dashboard is instantly populated.
- **Levy configuration** — the standard monthly levy is **KES 4,000** (KES 3,750 security + KES 250 others). Amounts are adjustable when posting.
- **Reset** — use **Settings → Reset to demo data** to restore the seeded residents, reconciled PDF balances, transactions, and project contributions.

> ⚠️ Because data lives in the browser, always back up your browser profile or use a shared machine consistently for long-term record keeping.

## Production deployment notes

The app now includes a local authenticated API with password hashing, short-lived signed access tokens, rotating refresh tokens, estate-scoped roles (`owner`, `manager`, `accountant`, and `viewer`), rate limiting, audit records, rolling local backups, and schema-version migration defaults. The JSON file store is suitable for local development and a single controlled demo, not a multi-instance cloud deployment. Production deployment still needs a managed database, HTTPS, secret management, distributed rate limiting, and managed backup storage.

The reminder endpoint records intended SMS/email work but does not send messages. Connect it to a queued provider such as Africa's Talking, Twilio, or an email service from the backend. Never put provider credentials in this React app.

---

## 🧰 Available Scripts

| Script | Description |
| --- | --- |
| `npm start` | Start the development server at `localhost:3000` |
| `npm run build` | Create an optimized production bundle in `build/` |
| `npm test` | Run tests in interactive watch mode |
| `npm run eject` | Eject from Create React App (one-way, irreversible) |

---

## 🤝 Contributing

Contributions are welcome! To get started:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit your changes: `git commit -m 'Add some feature'`.
4. Push to the branch: `git push origin feature/your-feature`.
5. Open a pull request.

Please ensure your changes pass `npm run build` before submitting.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<div align="center">

**© 2025 Lemayian Court** · Built with ❤️ for the Lemayian Court community.

</div>

