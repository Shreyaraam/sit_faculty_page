import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, query, where, doc, setDoc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCA40enAml33tAiF2z2qoPR-AQcm_65KuI",
    authDomain: "smart-attendance-system-1bd2a.firebaseapp.com",
    databaseURL: "https://smart-attendance-system-1bd2a-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "smart-attendance-system-1bd2a",
    storageBucket: "smart-attendance-system-1bd2a.firebasedestorage.app",
    messagingSenderId: "333311046363",
    appId: "1:333311046363:web:2314026371b145b433d2fe",
    measurementId: "G-11S5HD988J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global variables
let currentUser = null;
let currentSubject = null;
let currentStudent = null;
let currentFacultyData = null;

// Make functions available globally
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.showRegister = showRegister;
window.showLogin = showLogin;
window.showDashboard = showDashboard;
window.showStudentsList = showStudentsList;
window.selectSubject = selectSubject;
window.selectStudent = selectStudent;

// Auth state observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Find faculty document by email
        const facultyQuery = query(collection(db, 'faculty'), where('email', '==', user.email));
        const facultySnapshot = await getDocs(facultyQuery);
        
        if (!facultySnapshot.empty) {
            currentFacultyData = {
                id: facultySnapshot.docs[0].id,
                ...facultySnapshot.docs[0].data()
            };
            showDashboard();
        } else {
            showLogin();
        }
    } else {
        currentUser = null;
        currentFacultyData = null;
        showLogin();
    }
});

// Show/Hide containers
function showContainer(containerId) {
    document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
    document.getElementById(containerId).classList.add('active');
}

function showLogin() {
    showContainer('loginContainer');
}

function showRegister() {
    showContainer('registerContainer');
}

async function showDashboard() {
    if (!currentUser || !currentFacultyData) return;

    showContainer('dashboardContainer');

    // Load faculty info
    document.getElementById('facultyName').textContent = currentFacultyData.name;

    // Load subjects
    await loadSubjects();
}

async function showStudentsList() {
    if (!currentSubject) return;

    showContainer('studentsContainer');
    document.getElementById('subjectName').textContent = currentSubject.name;
    document.getElementById('subjectCode').textContent = currentSubject.id;
    await loadStudents(currentSubject.id);
}

async function showStudentDetails() {
    if (!currentStudent || !currentSubject) return;

    showContainer('detailsContainer');
    document.getElementById('studentDetailName').textContent = currentStudent.name;
    document.getElementById('studentDetailRoll').textContent = currentStudent.rollNo;
    document.getElementById('detailSubjectInfo').textContent = '${currentSubject.name} - ${currentSubject.id}';

    const attendanceClass = currentStudent.attendance >= 90 ? 'attendance-high' :
                              currentStudent.attendance >= 75 ? 'attendance-medium' :
                              currentStudent.attendance >= 60 ? 'attendance-low' : 'attendance-critical';

    document.getElementById('detailPercent').textContent = currentStudent.attendance + '%';
    document.getElementById('detailPercent').className = 'percent-value ' + attendanceClass;

    await loadAttendanceRecords(currentStudent.id, currentSubject.id);
}

// Login
async function handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('errorMessage');

    try {
        await signInWithEmailAndPassword(auth, email, password);
        errorDiv.style.display = 'none';
    } catch (error) {
        errorDiv.textContent = 'Invalid credentials. Please try again.';
        errorDiv.style.display = 'block';
    }
}

// Register
async function handleRegister() {
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const errorDiv = document.getElementById('registerErrorMessage');

    if (!name || !email || !password || !confirmPassword) {
        errorDiv.textContent = 'Please fill in all fields!';
        errorDiv.style.display = 'block';
        return;
    }

    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match!';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        // Check if this email and name exist in the faculty database
        const facultyQuery = query(
            collection(db, 'faculty'), 
            where('email', '==', email),
            where('name', '==', name)
        );
        const facultySnapshot = await getDocs(facultyQuery);

        if (facultySnapshot.empty) {
            errorDiv.textContent = 'Faculty not found. Please verify your name and email match our records.';
            errorDiv.style.display = 'block';
            return;
        }

        // Get the faculty document
        const facultyDoc = facultySnapshot.docs[0];
        const facultyData = facultyDoc.data();

        // Create authentication account ONLY
        await createUserWithEmailAndPassword(auth, email, password);

        // Update the faculty document to mark as registered (optional)
        await updateDoc(doc(db, 'faculty', facultyDoc.id), {
            registered: true,
            registeredAt: new Date()
        });

        alert('Registration successful! Loading your dashboard...');
        errorDiv.style.display = 'none';
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            errorDiv.textContent = 'This email is already registered. Please login instead.';
        } else {
            errorDiv.textContent = error.message;
        }
        errorDiv.style.display = 'block';
    }
}

// Logout
async function handleLogout() {
    try {
        await signOut(auth);
        currentUser = null;
        currentFacultyData = null;
        currentSubject = null;
        currentStudent = null;
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Load subjects
async function loadSubjects() {
    const grid = document.getElementById('subjectsGrid');

    try {
        if (!currentFacultyData) {
            grid.innerHTML = '<div class="empty-state">Faculty data not found.</div>';
            return;
        }

        const teachingSubjects = currentFacultyData.teachingSubjects || [];

        console.log('Faculty teaching subjects:', teachingSubjects);

        if (teachingSubjects.length === 0) {
            grid.innerHTML = '<div class="empty-state">No subjects assigned. Please contact admin.</div>';
            return;
        }

        grid.innerHTML = '';

        // Load each subject from the subjects collection
        for (const subjectCode of teachingSubjects) {
            try {
                // Try to get the subject document by ID
                const subjectDoc = await getDoc(doc(db, 'subjects', subjectCode));
                
                if (subjectDoc.exists()) {
                    const subjectData = subjectDoc.data();
                    const card = document.createElement('div');
                    card.className = 'subject-card';
                    card.onclick = () => selectSubject({
                        id: subjectDoc.id,
                        ...subjectData
                    });
                    card.innerHTML = `
                        <div class="subject-icon">📚</div>
                        <h3 class="subject-title">${subjectData.name || subjectDoc.id}</h3>
                        <p class="subject-code">${subjectDoc.id}</p>
                        <div class="subject-link">View Students →</div>
                    `;
                    grid.appendChild(card);
                }
            } catch (error) {
                console.error('Error loading subject:', subjectCode, error);
            }
        }

        if (grid.innerHTML === '') {
            grid.innerHTML = '<div class="empty-state">No subjects found in database.</div>';
        }
    } catch (error) {
        grid.innerHTML = '<div class="error-message">Error loading subjects: ' + error.message + '</div>';
        console.error('Load subjects error:', error);
    }
}

// Select subject
function selectSubject(subject) {
    currentSubject = subject;
    showStudentsList();
}

// Load students - CORRECTED VERSION
async function loadStudents(subjectId) {
    const tbody = document.getElementById('studentsTableBody');

    try {
        console.log('Loading students for subject:', subjectId);

        // Get the subject document
        const subjectDoc = await getDoc(doc(db, 'subjects', subjectId));

        if (!subjectDoc.exists()) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Subject not found.</td></tr>';
            document.getElementById('studentCount').textContent = 'Total Students: 0';
            return;
        }

        const subjectData = subjectDoc.data();
        console.log('Subject data:', subjectData);

        // Get enrolledStudents array from subject document
        const enrolledStudents = subjectData.enrolledStudents || [];
        console.log('Enrolled students array:', enrolledStudents);

        if (enrolledStudents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No students enrolled in this subject.</td></tr>';
            document.getElementById('studentCount').textContent = 'Total Students: 0';
            return;
        }

        tbody.innerHTML = '';
        let count = 0;

        // Load each enrolled student from students collection
        for (const studentId of enrolledStudents) {
            try {
                console.log('Fetching student:', studentId);
                
                // Get student document from students collection
                const studentDoc = await getDoc(doc(db, 'students', studentId));
                
                if (studentDoc.exists()) {
                    const studentData = studentDoc.data();
                    console.log('Student data:', studentData);
                    
                    const student = { 
                        id: studentDoc.id, 
                        ...studentData 
                    };
                    
                    count++;

                    // Calculate attendance percentage (default to 0 if not set)
                    const attendance = student.attendance || 0;
                    
                    const attendanceClass = attendance >= 90 ? 'attendance-high' :
                                              attendance >= 75 ? 'attendance-medium' :
                                              attendance >= 60 ? 'attendance-low' : 'attendance-critical';

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td style="font-weight: 600;">${student.rollNo || student.id}</td>
                        <td>${student.name || 'N/A'}</td>
                        <td style="text-align: center;">
                            <span class="attendance-badge ${attendanceClass}">${attendance}%</span>
                        </td>
                        <td style="text-align: center;">
                            <button class="btn-view" onclick="selectStudent(${JSON.stringify(student).replace(/"/g, '&quot;')})">
                                📅 View Details
                            </button>
                        </td>
                    `;
                    tbody.appendChild(row);
                } else {
                    console.log('Student document not found:', studentId);
                }
            } catch (error) {
                console.error('Error loading student:', studentId, error);
            }
        }

        if (count === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No student data found.</td></tr>';
        }

        document.getElementById('studentCount').textContent = 'Total Students: ${count}';
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="error-message">Error loading students: ' + error.message + '</td></tr>';
        console.error('Load students error:', error);
    }
}

// Select student
function selectStudent(student) {
    currentStudent = student;
    showStudentDetails();
}

// Load attendance records
async function loadAttendanceRecords(studentId, subjectId) {
    const recordsList = document.getElementById('recordsList');

    try {
        const q = query(
            collection(db, 'attendance'),
            where('studentId', '==', studentId),
            where('subjectId', '==', subjectId)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            recordsList.innerHTML = '<div class="empty-state">No attendance records available.</div>';
            return;
        }

        recordsList.innerHTML = '';

        querySnapshot.forEach((docSnap) => {
            const record = docSnap.data();
            const item = document.createElement('div');
            item.className = 'record-item';
            item.innerHTML = `
                <div class="record-date">
                    📅 ${record.date}
                </div>
                <span class="status-badge ${record.status === 'present' ? 'status-present' : 'status-absent'}">
                    ${record.status === 'present' ? 'Present' : 'Absent'}
                </span>
            `;
            recordsList.appendChild(item);
        });
    } catch (error) {
        recordsList.innerHTML = '<div class="error-message">Error loading records: ' + error.message + '</div>';
    }
}