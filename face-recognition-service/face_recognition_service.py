from flask import Flask, request, jsonify
import os
import numpy as np
import cv2
import base64
import json
from ultralytics import YOLO  # For YOLOv11
import time
from flask_cors import CORS
import torch
from deepface import DeepFace
from scipy.spatial.distance import cosine

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
MODEL_PATH = os.environ.get('MODEL_PATH', 'yolov11_face_model.pt')
CONFIDENCE_THRESHOLD = 0.5
PORT = int(os.environ.get('PORT', 5000))

# Load the YOLO model
print(f"Loading model from {MODEL_PATH}...")
model = None

try:
    model = YOLO(MODEL_PATH)  # YOLOv11 model
    print("Model loaded successfully!")
except Exception as e:
    print(f"Error loading model: {e}")

# Student face embeddings database
# This would ideally be loaded from a file or database
student_faces = {}  # Will store {student_id: face_embedding}

# Load student faces from a JSON file if it exists
STUDENT_FACES_PATH = "student_faces.json"
if os.path.exists(STUDENT_FACES_PATH):
    try:
        with open(STUDENT_FACES_PATH, 'r') as f:
            stored_faces = json.load(f)
            for student_id, embedding_str in stored_faces.items():
                student_faces[student_id] = np.array(json.loads(embedding_str))
        print(f"Loaded {len(student_faces)} student face embeddings")
    except Exception as e:
        print(f"Error loading student faces: {e}")

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    return jsonify({"status": "healthy", "model_loaded": model is not None})

@app.route('/detect', methods=['POST'])
def detect_faces():
    """Endpoint to detect faces in an image and recognize students"""
    if model is None:
        return jsonify({"error": "Model not loaded"}), 500
    
    # Get image from request
    try:
        image_data = request.json.get('image')
        if not image_data:
            return jsonify({"error": "No image data provided"}), 400
        
        # Decode base64 image
        encoded_data = image_data.split(',')[1] if ',' in image_data else image_data
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Run YOLOv11 detection
        start_time = time.time()
        results = model(img)
        inference_time = time.time() - start_time
        
        # Process results
        detections = []
        for result in results:
            boxes = result.boxes  # Boxes object for bounding boxes outputs
            
            for i, box in enumerate(boxes):
                conf = float(box.conf[0])
                if conf < CONFIDENCE_THRESHOLD:
                    continue
                
                # Get bounding box coordinates
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                
                # Extract the face
                face_img = img[y1:y2, x1:x2]
                
                # Here you would generate face embedding and compare to known students
                # For demo, we'll use a placeholder function
                student_id = find_matching_student(face_img)
                
                detections.append({
                    "box": [x1, y1, x2, y2],
                    "confidence": conf,
                    "student_id": student_id
                })
        
        return jsonify({
            "success": True,
            "detections": detections,
            "inference_time": inference_time,
            "total_faces": len(detections)
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def find_matching_student(face_img):
    """
    Find a matching student based on face embedding comparison.
    
    Args:
        face_img (np.ndarray): Cropped face image from YOLOv11 detection (BGR format).
    
    Returns:
        str or None: University ID of the matched student, or None if no match is found.
    """   
    try:
        # Convert BGR (OpenCV) to RGB (required by DeepFace)
        face_img_rgb = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
        
        # Generate face embedding using DeepFace with Facenet model
        embedding = DeepFace.represent(
            img_path=face_img_rgb,
            model_name="Facenet",
            enforce_detection=False,  # Assume face is already detected by YOLO
            detector_backend="skip"   # Skip detection since we have a cropped face
        )[0]["embedding"]
        
        # Convert embedding to NumPy array
        embedding = np.array(embedding)
        
        # Compare with stored student embeddings
        similarity_threshold = 0.6  # Cosine similarity threshold (adjust based on testing)
        min_distance = float('inf')
        matched_student_id = None
        
        for student_id, stored_embedding in student_faces.items():
            # Compute cosine distance (1 - cosine similarity)
            distance = cosine(embedding, stored_embedding)
            similarity = 1 - distance
            
            if similarity > similarity_threshold and distance < min_distance:
                min_distance = distance
                matched_student_id = student_id
        
        # Return matched student ID or None if no match is found
        return matched_student_id if matched_student_id else None

    except Exception as e:
            print(f"Error in face recognition: {e}")
            return None

@app.route('/register', methods=['POST'])
def register_face():
    """Endpoint to register a new face for a student"""
    try:
        data = request.json
        university_id = data.get('university_id')
        image_data = data.get('image')
        
        if not university_id or not image_data:
            return jsonify({"error": "Missing university_id or image"}), 400
        
        # Decode base64 image
        encoded_data = image_data.split(',')[1] if ',' in image_data else image_data
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Detect face in the image
        if model is None:
            return jsonify({"error": "Model not loaded"}), 500
        
        results = model(img)
        if len(results[0].boxes) == 0:
            return jsonify({"error": "No face detected in the image"}), 400
        
        # Use the largest face if multiple are detected
        boxes = results[0].boxes
        areas = [(box.xyxy[0][2] - box.xyxy[0][0]) * (box.xyxy[0][3] - box.xyxy[0][1]) for box in boxes]
        largest_face_idx = np.argmax(areas)
        box = boxes[largest_face_idx]
        
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        face_img = img[y1:y2, x1:x2]
        
        # Generate face embedding (placeholder - implement with actual face recognition)
        embedding = np.random.rand(128)  # Placeholder 128-dimensional embedding
        
        # Store the embedding
        student_faces[university_id] = embedding
        
        # Save to file
        with open(STUDENT_FACES_PATH, 'w') as f:
            # Convert numpy arrays to lists for JSON serialization
            serializable_faces = {
                student_id: json.dumps(emb.tolist()) 
                for student_id, emb in student_faces.items()
            }
            json.dump(serializable_faces, f)
        
        return jsonify({
            "success": True,
            "message": f"Face registered for student {university_id}"
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=True)
