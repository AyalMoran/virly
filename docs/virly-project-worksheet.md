

**Worksheet for Web Banking Application**

**Goal**

Develop a **full-stack web banking platform** that allows users to **register, verify their identity via SMS or Email**, log in securely, manage their account, transfer money to other users, and interact with a **Digital Customer Service** system — all through a modern and responsive web interface.

**Develop a web banking application**  
**Overview**  
In this task, you need to build a web application for a bank. The user will be able to  
sign-up & sign in to the bank using a username & password, and validating their  
phone number/ email using a one-time passcode sent by SMS/Email  message.

**Technical notes**  
1\. Use React for frontend, NodeJS for server, Mongo for DB.  
2\. Implement the Figma designs for the application UI.  
3\. Use Twilio integration for SMS service Or email validation.  
4\. The web application needs to be hosted on a platform of your choice.  
**5\. You can use AI tools \!**

**Requirements**  
**1\. Sign up**  
a) The user can sign up to the bank by choosing an email address, a password,  
and inserting their phone number.  
b) user canʼt register with the same email address more than once (otherwise,  
present an error message).  
c) Validate that the entered email address format and the phone number  
    format are valid.  
**2\. Phone/ Email validation**  
a) During sign up, an SMS / Email message with a passcode (6 random digits) is sent to  
the user in order to validate their phone number / email.  
b) Once the user enters the correct passcode, the registration process is  
succeeded and the user is redirected to the dashboard.  
c) If the passcode is not correct, show an error message.  
**3\. Dashboard**  
a) The dashboard page is protected, access only after sign up / sign in  
b) A random account balance will be set once the user was sign up.  
c) The user can see their balance and recent transactions.  
d) The user can sign out by pressing the Sign Out button, and redirect to the login page.  
**4\. Login**  
a) The user can sign in by inserting their correct email & password.  
b) If validated, the user is redirected to the dashboard. Otherwise, present an  
error message.  
**5\. Transaction**  
a) The user can send money to another registered user, by typing the userʼs email  
address & amount, and press Submit.  
b) If the user doesnʼt have enough balance, or the email address doesnʼt exist,  
show an error message.  
c) Once submitted successfully, present another transaction record  
1\. for sender: the receiver email & the sent amount with ‘-ʼ sign.  
2\. for receiver: the sender email & the received amount with ‘+ʼ sign.  
**Phases** 

|  | Prerequisite | Days | Phase  |
| :---- | :---- | ----- | ----- |
| Define Rest API using swagger Relevant Sequence Diagram | HTTP  REST API \+ CRUD Principle Postman Swagger JWT \- theory | 2 | 1  |
| Implementation of BE (no DB only use memory to store / retrieve data) Test using Postman  | JS TypeScript   NODE.JS Express JWT  | 2 | 2 |
| Design DB schema using swagger Implementation | MongoDB Mongoose | 1 | 3 |
| Run Backend on using docker | Docker | 1 | 4 |
| Design UI / UX using                 Figma for 5 web pages.  Registration Login Logout Money Transfer Screen Dashboard | Figma | 0.5 | 5 |
| Implement Front End | HTML,  CSS,  JS TypeScript   REACT Material UI | 2 | 6 |
| Implement transfer money notification between customers | Web Socket Socket.IO | 2 | 7 |
| Implement Video Call between a person who sends the money to the person who receives the money | Jitsi | 2 | 8 |
| implement  customer service chat bot using LLM  | Open AI Package | 1 | 9 |
| Implement Testing for BE | jest \+ super test | 1 | 10 |
| Add front end testing | Cypress | 1 | 11 |

# **Keywords**

| Technical Stack Keywords | Functional / Feature Keywords | Security & Architecture Keywords | Development & Testing Keywords |
| :---- | :---- | :---- | :---- |
| React | user registration | authentication | unit testing |
| TypeScript | login system | encryption | integration testing |
| Node.js | logout functionality | JWT tokens | end-to-end testing |
| Express.js | account verification | secure REST API | Cypress testing |
| MongoDB | money transfer | data validation | backend testing |
| Mongoose | protected routes | session security | frontend testing |
| JWT authentication | unique email validation | role-based access | CI/CD pipeline |
| REST API | session management | API rate limiting | Docker containerization |
| Swagger | JWT tokens | CORS | API documentation |
| Postman | API integration |   | Swagger UI |
| Docker | error handling |   | Postman testing |
| Material UI | database schema |   |  |
| Vercel | customer service chat bot |   |  |
| Render |   |   |  |
| Railway |   |   |  |
| Cypress |   |   |  |
| Jest |   |   |  |
| Supertest |   |   |  |
| Twilio API |   |   |  |
| Socket.IO |   |   |  |
| Jitsi |   |   |  |
| Nodemailer |   |   |  |
| Figma |   |   |  |

# **Questions**
## **Technical Stack Keywords**

### - What is React and how does it help build interactive UIs?
- 

### - How does TypeScript improve reliability and maintainability in large projects?
- 

### - How does Express.js simplify server-side routing and middleware?
- 

### - What is MongoDB and how is data stored differently than in SQL databases?
- 

### - What problem does JWT authentication solve, and how does it work?
- 

### - What is a REST API and what are its core principles?
- 

### - How does Swagger help document and test APIs?
- 

### - What is Postman used for in backend development?
- 

### - How does Docker help in deploying consistent environments?
- 

### - Why use Material UI in a React project?
- 

### - What services like Vercel, Render, or Railway offer for app hosting?
- 

### - What is Cypress and how is it used for frontend testing?
- 

### - What is Jest and what types of tests can it perform?
- 

### - What is Supertest and how is it used in backend API testing?
- 

### - What is Socket.IO and how does it enable real-time communication?
- 

### - How is Jitsi used for implementing video calls in a web app?
- 

### - What is Nodemailer and how do you send emails from Node.js?
- 

### - Why would you use Figma in a full-stack project workflow?
- 

## Functional / Feature Keywords

### - How does user registration typically work in web applications?
- 

### - What are the steps in a secure login system?
- 

### - What should happen when a user logs out?
- 

### - Why is account verification important and how can it be implemented?
- 

### - How does a money transfer process ensure data accuracy and security?
- 

### - How do you ensure that each email is unique in user registration?
- 

### - What is session management and how does JWT help with it?
- 

### - How are JWT tokens created, validated, and refreshed?
- 

### - How should errors be handled gracefully in a web application?
- 

### - How can a customer service chatbot improve user experience?
- 

### - How Password kept in DB ?
- 

## Security & Architecture Keywords

### - What is authentication and how is it implemented in Node.js apps?
- 

### - What is encryption and where is it used in a banking system?
- 

### - What role do JWT tokens play in securing communication?
- 

### - How can you secure a REST API against unauthorized access?
- 

### - Why is data validation important, and what libraries help achieve it?
- 

### - How does session security protect user data?
- 

### - What is CORS, and why must it be configured properly in web apps?
- 

