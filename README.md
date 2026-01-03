# GrowthSetHub - Business Simulator

## Overview

**GrowthSetHub** is a  that allows users to start and upgrade businesses, invest in stocks and real estate, and track their net worth over time. The platform provides a modern, interactive UI for an engaging experience.

### Key Features

- User authentication and personalized profiles  
- Start and upgrade businesses  
- Invest in real estate and stocks  
- Live balance updates via backend cron jobs  
- Real-time updates using WebSockets  

---

## Demo Screenshots

**Stocks Graph**  
<img src="./public/images/stocks.png" width="600" />

**Real Estate Market**  
<img src="./public/images/realestate.png" width="600" />

**Profile Page**  
<img src="./public/images/profile.png" width="600" />

---

## Tech Stack

**Frontend:** HTML, CSS, JavaScript  
**Backend:** Node.js, Express.js, MySQL, Cron Jobs, WebSockets, RESTful APIs  

---

## Schema Diagram

![Schema Diagram](./public/images/schemadiagram.jpg)

---

## Basic Setup

### Backend

```bash
# Clone the repo
git clone https://github.com/SRIRAM231005/GrowthSetHub.git
cd GrowSetHub/backend

# Install dependencies
npm install

# Start backend server
npm start
