<h1 align="center">Asistancia: Face Recognition Attendance System</h1>

## 📋 Project Overview

**Asistancia** is an innovative attendance tracking system that leverages facial recognition technology powered by YOLOv11, integrated with a Node.js backend and a web-based frontend. Designed for educational institutions, it automates student attendance, provides class and student management, and supports both manual and AI-driven attendance recording.

### Key Features
- **Face Recognition**: Detects and identifies students using YOLOv11 and face embeddings.
- **Web Interface**: Manage classes, students, and attendance via user-friendly HTML/CSS/JS pages.
- **Role-Based Access**: Supports admin, teacher, and student roles with secure session-based authentication.
- **Database Integration**: Stores data in MySQL for users, students, classes, and attendance.
- **API Endpoints**: Handles login, attendance, and class management seamlessly.

---

## 🛠️ Technologies Used

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=python,js,html,css,nodejs,express,mysql,flask,git,github,vscode,postman,ai,tensorflow" alt="Skill Icons" />
  </a>
</p>

---

## 📦 Installation

Follow these steps to set up the project locally:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/kareemmazrou01/Assistancia
   cd Assistancia
   ```
2. **Backend Setup**:
   ```bash
   # Install Node.js dependencies
   npm install

   # Create .env file
   touch .env
   ```
   ```dotenv
    DB_HOST=localhost
    DB_USER=your_username
    DB_PASSWORD=your_password
    DB_NAME=assistancia_db
    SESSION_SECRET=your_secret_key
    ```
 3. **Face Recognition Service Setup**:
    ```bash
    # Navigate to the face recognition service directory
    cd face-recognition-service

    # Setup virtual environment, access and install requirementts
    python -m venv venv
    .\venv\Scripts\activate
    pip install flask flask-cors opencv-python numpy scipy ultralytics deepface tf-keras

    # Run server
    node server.js

    # Activate python app
    cd face-recognition-service
    python face_recognition_service.py
    ```

## 🤝 Contribution
Contributions are welcome! To contribute:
1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature`).
3. Make your changes and commit (`git commit -m "Add your feature"`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

## 📜 License
This project is licensed under the *FOTOX* License.
