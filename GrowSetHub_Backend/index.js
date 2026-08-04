require("dotenv").config();
const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const cron = require("node-cron");
const { connection } = require("./db");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => {
  res.send("Socket.io Server is Running!");
});

// Client connects with ?username=..., joins a room by that name for targeted emits
io.on("connection", async (socket) => {
  const username = socket.handshake.query.username;

  if (!username) {
    console.log("Socket connected without a username, disconnecting:", socket.id);
    socket.disconnect(true);
    return;
  }

  console.log(`User connected: ${socket.id} (${username})`);
  socket.join(username);

  // Send current state immediately on connect
  try {
    const db = await connection();
    const [businesses] = await db.query(`SELECT * FROM BankBusiness WHERE Username = ?`, [username]);
    socket.emit("updateBanks", businesses);

    const [projects] = await db.query(`SELECT * FROM ITUserprojects WHERE Username = ?`, [username]);
    socket.emit("updateProjects", projects);
  } catch (err) {
    console.error("Error sending initial state to", username, err);
  }

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id, username);
  });
});

// Marks overdue projects complete, then sends each user their own projects
async function updateProjectStatus() {
  try {
    const db = await connection();
    await db.query(
      `UPDATE ITUserprojects SET ProjectStatus = 1 WHERE ProjectStatus = 0 AND ProjectCompTime <= NOW()`
    );

    const [projects] = await db.query(`SELECT * FROM ITUserprojects`);

    // Group by owner so each client only receives its own rows.
    const projectsByUser = {};
    for (const project of projects) {
      if (!projectsByUser[project.Username]) projectsByUser[project.Username] = [];
      projectsByUser[project.Username].push(project);
    }
    for (const [username, userProjects] of Object.entries(projectsByUser)) {
      io.to(username).emit("updateProjects", userProjects);
    }
  } catch (err) {
    console.error("Error updating project status:", err);
  }
}

// Recalculates deposits/credits for overdue accounts and pushes updates per user
async function updateBankStatus() {
  try {
    const db = await connection();
    const [users] = await db.query(`SELECT * FROM BankBusiness WHERE IntSetTime <= NOW()`);

    if (users.length === 0) return;

    await db.query(
      `UPDATE BankBusiness SET IntSetTime = DATE_ADD(NOW(), INTERVAL 1 MINUTE) WHERE IntSetTime <= NOW()`
    );

    const [[{ competitorCreditAvg }]] = await db.query(
      `SELECT AVG(CreditInt) AS competitorCreditAvg FROM BankBusiness`
    );

    const marketingInvestment = 50;

    // Sequential loop avoids the forEach race condition
    for (const user of users) {
      const [levelRows] = await db.query(`SELECT Level FROM Balances WHERE Username = ?`, [user.Username]);
      const level = levelRows[0].Level;

      const totalDeposits = calculateTotalDeposits(
        user.CreditInt,
        user.DebitInt,
        level,
        marketingInvestment,
        competitorCreditAvg
      );

      const totalCredits = calculateTotalCredits(
        user.DebitInt,
        user.CreditInt,
        level,
        marketingInvestment,
        Number(user.TotalAmount) + Number(totalDeposits),
        competitorCreditAvg
      );

      await db.query(
        `UPDATE BankBusiness SET TotalAmount = TotalAmount + ?, TotalCredits = ?, TotalDeposits = ? WHERE Username = ? AND BusinessName = ?`,
        [
          (totalDeposits - totalCredits).toFixed(2),
          totalCredits.toFixed(2),
          totalDeposits.toFixed(2),
          user.Username,
          user.BusinessName,
        ]
      );

      // Push only this user's updated businesses to them (not a global broadcast).
      const [updated] = await db.query(`SELECT * FROM BankBusiness WHERE Username = ?`, [user.Username]);
      io.to(user.Username).emit("updateBanks", updated);
    }
  } catch (err) {
    console.error("Error updating bank status:", err);
  }
}

function calculateTotalDeposits(creditInterest, debitInterest, level, marketingInvestment, competitorCreditAvg) {
  const baseDeposit = 10000;
  const marketingBoost = Math.log10(marketingInvestment + 10) * 100;
  const levelMultiplier = 1 + Math.pow(level, 1.5) * 0.1;
  const interestGap = debitInterest - creditInterest;
  const interestBoost = (creditInterest / (interestGap + 1)) * 100;
  const competitiveness = Math.max(0.5, 1 + (creditInterest - competitorCreditAvg) * 0.1);
  const totalDeposits = (baseDeposit + marketingBoost * levelMultiplier + interestBoost) * competitiveness;
  return Math.round(totalDeposits);
}

function calculateTotalCredits(debitInterest, creditInterest, level, marketingInvestment, totalDeposits, competitorCreditAvg) {
  const baseCreditDemand = 8000;
  const marketingBoost = Math.log10(marketingInvestment + 10) * 80;
  const levelMultiplier = 1 + Math.pow(level, 1.3) * 0.08;
  const interestAppeal = Math.max(1, Number(competitorCreditAvg) / Number(creditInterest) + 0.5);
  const riskCap = Number(totalDeposits) * 0.85;
  const rawLoanDemand = (baseCreditDemand + marketingBoost * levelMultiplier) * interestAppeal;
  const totalCredits = Math.min(riskCap, rawLoanDemand);
  return Math.round(totalCredits);
}

// Catches up anything missed during downtime, then starts recurring cron jobs
async function startScheduledJobs() {
  console.log("Running startup catch-up pass...");
  await updateProjectStatus();
  await updateBankStatus();

  cron.schedule("*/5 * * * *", () => {
    console.log("Running scheduled project status check...");
    updateProjectStatus();
  });

  cron.schedule("* * * * *", () => {
    console.log("Running scheduled bank status update...");
    updateBankStatus();
  });

  console.log("Cron jobs scheduled.");
}

const userrouter = require("./routes/users");
const ITbusinessrouter = require("./routes/ITbusiness");
const investmentrouter = require("./routes/investment");
const BankCorporationRouter = require("./routes/Bank-Corporationbusiness");
const bodyParser = require("body-parser");
const cors = require("cors");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use("/user", userrouter);
app.use("/ITbusiness", ITbusinessrouter);
app.use("/investment", investmentrouter);
app.use("/Bank-Corporationbusiness", BankCorporationRouter);

server.listen(8008, () => {
  console.log("socket started");
  startScheduledJobs();
});
