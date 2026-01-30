Digital-Harm-Prevention-System
Minor project




Project Overview
The **Digital Harm Prevention System** is a web-based prototype designed to reduce irreversible digital mistakes made by users due to haste, stress, or panic-like behavior.  
The system simulates critical digital actions (such as sending money or deleting data) and introduces safety mechanisms like warnings, delays, and confirmations based on the detected risk level.

This project focuses on **user safety, explainable decision-making, and behavior-aware system design** rather than real-world execution.



Problem Statement
Users often perform irreversible digital actions without fully understanding the associated risks. Existing systems prioritize speed and efficiency but lack mechanisms to detect rushed or panic-like user behavior and pause the user before a mistake occurs.


## Proposed Solution
The system analyzes:
- **Action-based risk** (e.g., large transaction amount)
- **User interaction behavior** (e.g., rapid repeated clicks)

Based on this analysis, the system:
- Allows safe actions immediately
- Warns users for medium-risk actions
- Delays or blocks high-risk actions to encourage reconsideration

---

##  Key Features
- Simulated digital actions (no real money or data)
- Rule-based risk scoring (Low / Medium / High)
- Detection of panic-like behavior using interaction patterns
- Warning messages and confirmation delays
- Optional ML-assisted behavior classification
- Action logging for analysis and audit

---

##  System Architecture
- **Frontend**: Collects user input and displays warnings/results
- **Backend**: Processes actions and evaluates risk
- **Risk Engine**: Rule-based scoring logic
- **ML Layer (Optional)**: Assists in detecting panic-like behavior
- **Database**: Stores action logs (SQLite)

---

##  Technology Stack
- **Frontend**: HTML, CSS, JavaScript  
- **Backend**: Python (Flask)  
- **Database**: SQLite  
- **Machine Learning (Optional)**: Scikit-learn (Logistic Regression)  
- **Tools**: VS Code, Git, GitHub  

