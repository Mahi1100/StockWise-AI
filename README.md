

# StockWise AI: Cognitive Automation Framework

## Project Overview

[cite\_start]**StockWise AI** is a full-stack web application designed to solve the critical inventory management problems faced by Small and Medium-sized Enterprises (SMEs)[cite: 150]. [cite\_start]The core innovation is a **Hybrid AI Architecture** that combines statistical sales analysis with Large Language Model (LLM) reasoning to provide clear, actionable, and contextual demand forecasts and reorder recommendations[cite: 30, 31].

[cite\_start]The application is deployed using a decoupled structure: **Python/Flask API** (Backend) and **React/Vite** (Frontend)[cite: 85, 94].

##  Key Features Implemented

  * [cite\_start]**Hybrid AI Core (F4, F5):** Generates prescriptive reorder points and quantities by integrating historical sales trends with unstructured, qualitative market context (e.g., "upcoming promotion")[cite: 31, 32].
  * [cite\_start]**Data Intelligence (F3):** Visualizes historical sales trends using Pandas and Chart.js[cite: 215].
  * [cite\_start]**Operational Control (F2, F6):** Tracks SKUs, records sales, and manages Purchase Orders (POs), automatically updating stock levels upon receiving an order[cite: 313, 339].
  * [cite\_start]**Strategic Planning (F7):** Includes a "What If" Scenario Analysis tool powered by the LLM for risk assessment[cite: 342].

-----

## ⚙️ Local Setup and Installation

Follow these steps to set up and run the full application locally.

### 1\. Prerequisites

You must have the following installed on your system:

  * **Python 3.8+**
  * **Node.js & npm/yarn**
  * **MongoDB Atlas:** A running database cluster with the connection URI and a dedicated database user.
  * **Gemini API Key:** An active API key for LLM integration.

### 2\. Backend Setup (Python/Flask API)

Navigate to the `stockwise_ai` directory in your terminal.

| Step | Command | Description |
| :--- | :--- | :--- |
| **a. Create Venv** | `python -m venv venv` | Creates an isolated environment. |
| **b. Activate Venv** | `.\venv\Scripts\activate` | Activates the environment on Windows. |
| **c. Install Dependencies** | `pip install -r requirements.txt` | Installs Flask, Gunicorn, Pandas, MongoEngine, etc. |
| **d. Configure Secrets** | **Create a file named `.env`** | Place your connection strings inside this file (see Configuration below). |
| **e. Start Server** | `python app.py` | Starts the Flask development server (runs on `http://127.0.0.1:5000`). |

### 3\. Frontend Setup (React/Vite)

Open a **separate terminal window** and navigate to the `stockwise-frontend` directory.

| Step | Command | Description |
| :--- | :--- | :--- |
| **a. Install Node Modules** | `npm install` | Installs React, React-Bootstrap, Chart.js, etc. |
| **b. Start Frontend** | `npm run dev` | Starts the Vite development server (runs on `http://localhost:5173/`). |

The frontend is configured with a proxy in `vite.config.js` to automatically redirect API calls (`/api/*`) to the running backend on port 5000.

-----

##  Configuration (`.env.example`)

Before running the backend, create a file named **`.env`** in the **`stockwise_ai`** directory and fill in your unique credentials.

```
# .env (Create this file in the stockwise_ai directory)

# MongoDB Atlas Connection URI
MONGO_URI="mongodb+srv://USER:PASSWORD@clustername.mongodb.net/stockwise_ai_db?retryWrites=true&w=majority"

# Google Gemini API Key for LLM integration (F4, F5, F7)
GEMINI_API_KEY="YOUR_SECRET_GEMINI_KEY"

# Flask Secret Key for session security
SECRET_KEY="A_STRONG_RANDOM_SECRET"
```

-----

##  Deployment (Production Environment)

The project is structured for a scalable, decoupled production deployment:

  * **Backend API (`stockwise_ai`):** Deployed as a **Web Service on Render** using **Gunicorn** and reading the `Procfile` command (`web: gunicorn app:app`).
  * **Frontend UI (`stockwise-frontend`):** Deployed as a **Static Site on Netlify/Vercel**. API calls are hardcoded in the frontend hooks to use the absolute public URL of the deployed Render API.

-----

##  Future Scope (Beyond the MVP)

[cite\_start]To transform this successful prototype into a market-ready product, the next phases include[cite: 109]:

  * **Advanced ML Integration:** Separate the statistical prediction from the cognitive layer. [cite\_start]Use a dedicated ML model (e.g., ARIMA) for numerical forecasting, and reserve the LLM for **interpreting** those results and **generating the narrative**[cite: 111].
  * [cite\_start]**External Integrations:** Implement API connectors to external systems like **Shopify/POS** platforms for automated sales data synchronization (eliminating manual entry)[cite: 110].
  * [cite\_start]**Enhanced Reporting:** Implement advanced features for multi-location inventory management and detailed supply chain risk analysis[cite: 114].
