# 🌱 EcoFinds - Your Go-To Sustainable Marketplace!

Welcome to EcoFinds! We're building a vibrant, eco-conscious marketplace where you can easily buy and sell pre-loved items. Our goal is to make sustainable shopping delightful and trustworthy, helping products find new homes and reducing waste.

![EcoFinds Logo](https://img.shields.io/badge/EcoFinds-Sustainable%20Marketplace-2ECC71?style=for-the-badge&logo=leaf&logoColor=white)




## ✨ What Makes EcoFinds Awesome?

*   *Stunning Design*: A beautiful, premium look with calming greens, smooth animations, and a user-friendly interface that feels fresh and alive.
*   *Easy Buying & Selling*: Quickly list your items, browse through amazing finds, add to cart, and track your purchases. We make second-hand shopping a breeze!
*   *Connect & Chat*: Chat directly with buyers and sellers in real-time, ask questions, and build a trusted community.
*   *Admin Tools*: Our admins keep things fair and safe by moderating listings and managing users.
*   *Mobile-Friendly*: Designed from the ground up to look great and work flawlessly on your phone, tablet, or desktop.
*   *Built for India*: Focused on Indian users with local validations and features.

## 🚀 Get Started (for Developers)

Want to run EcoFinds on your machine? Here’s how!

### You'll Need:
-   [Node.js](https://nodejs.org/) (version 14 or newer)
-   npm (comes with Node.js)

### Steps:

1.  *Grab the Code:*
    bash
    git clone https://github.com/yourusername/ecofinds.git
    cd ecofinds
    

2.  *Install Backend Goodies:*
    bash
    cd backend
    npm install
    

3.  *Set Up Your Secrets:*
    Copy env.example to .env and fill in your database details and a secret key.
    bash
    cp env.example .env
    # Open .env and customize:
    # PORT=5000
    # DB_HOST=localhost
    # DB_USER=root
    # DB_PASSWORD=your_database_password
    # DB_NAME=ecofinds
    # JWT_SECRET=your-super-secret-key-for-tokens
    # NODE_ENV=development
    

4.  *Build the Database:*
    bash
    node database/init.js
    
    This creates an SQLite database and populates it with some initial data (like categories and an admin user!).

5.  *Fire Up the Backend!*
    bash
    npm start
    
    Your backend API will be buzzing on http://localhost:5000.

6.  *See the Frontend in Action:*
    Just open the index.html file in your web browser! (No extra server needed for the frontend, it's all in one file for now).

## 🛠 Tech Stack Snippets

*   *Frontend*: HTML, CSS, Vanilla JavaScript (clean and snappy!)
*   *Backend*: Node.js, Express.js (making the API fast and efficient)
*   *Database*: SQLite (super easy for development!)
*   *Auth*: JWT (keeping your login secure)
*   *Real-time Chat*: Socket.io (for instant messages!)

## 🤝 Want to Help?

We'd love your contributions! Feel free to:
1.  Fork this repo.
2.  Create a new branch for your awesome feature.
3.  Commit your changes.
4.  Send us a Pull Request!

## Quick file structure

- index.html — Single-file frontend (HTML + inline CSS + JS). Main entry for the UI.
- assets/ — Static assets (images, logo, icons).
  - Place your logo image here. Recommended filename: logo.png or logo.svg.
  - Current logo file: assets/ChatGPT Image Sep 6, 2025, 10_50_47 AM.png — you can rename it to logo.png and update index.html accordingly.
- backend/ — Node backend (example API/server)
  - backend/package.json — backend dependencies and scripts
  - backend/server.js — server entrypoint
  - backend/config/ — configuration helpers (e.g., database.js)
  - backend/database/ — DB files and initialization scripts
  - backend/middleware/, backend/models/, backend/routes/ — server code organization

## Where to put files and assets

- Logo: put logo files in assets/ (recommended names: logo.png or logo.svg).
  - If you rename the file, update the src attribute on the <img> inside the header in index.html.

- Additional images used by product listings may be kept in assets/ or referenced from external URLs (the sample data uses external Unsplash URLs).

- Static CSS: this project uses inline styles inside index.html. If you extract CSS to a separate file, place it at assets/styles.css and update the <link> in index.html.

## Brand & color tokens (where to edit)

- The top of index.html contains a :root CSS block with color variables. Edit these variables to change the brand palette and spacing:
  - Example variables: --brand-gradient, --bg-beige, --card-bg, --heading-dark, --body-gray, --muted-gray, --card-shadow.

## How to preview the frontend (quick)

1. Open the project folder in your file explorer.
2. Open index.html in your browser (double-click or right-click → Open with → Browser).

For iterative development you can use a simple local server (recommended) to avoid CORS/file path quirks. From PowerShell (Windows):

powershell
# from the project root
# if you have Python installed
python -m http.server 8000
# then open http://localhost:8000/


Or use any static-server you prefer (VS Code Live Server, http-server, etc.).

## How to run the backend (basic)

1. Open a terminal and change into the backend directory:

powershell
cd backend


2. Install dependencies and start (if package.json defines scripts):

powershell
npm install
# start the server (may be `npm start` or `node server.js` depending on backend/package.json)
npm start


If npm start is not present, run node server.js instead.

## Notes & small tasks to keep the project tidy

- Rename the logo in assets/ to logo.png and change the <img> in index.html to assets/logo.png for a cleaner path.
- Consider extracting the large inline CSS into assets/styles.css for maintainability.
- If you change variable names in :root, keep them consistent across the file.

## Contact / Next steps

If you want, I can:
- Extract styles into a separate CSS file.
- Rename the logo and update references.
- Add a small build/start script or Live Server task for VS Code.

Open an issue or tell me which next step to take and I will implement it.


## 📄 License

This project is open-source under the MIT License.

---

<div align="center">

*🌱 Built with ❤ for a sustainable future by Shashankareddy Karamudi*
