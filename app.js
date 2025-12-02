import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, query, where, doc, setDoc, getDoc, updateDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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
    document.getElementById('facultyName').textContent = currentFacultyData.name;
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
    document.getElementById('studentDetailRoll').textContent = currentStudent.studentNumber || currentStudent.rollNo || currentStudent.email;
    document.getElementById('detailSubjectInfo').textContent = `${currentSubject.name} - ${currentSubject.id}`;

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

        const facultyDoc = facultySnapshot.docs[0];
        await createUserWithEmailAndPassword(auth, email, password);
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

        if (teachingSubjects.length === 0) {
            grid.innerHTML = '<div class="empty-state">No subjects assigned. Please contact admin.</div>';
            return;
        }

        grid.innerHTML = '';

        for (const subjectCode of teachingSubjects) {
            try {
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

// Load students - UPDATED TO WORK WITH BOTH REGISTRATION METHODS
async function loadStudents(subjectId) {
    const tbody = document.getElementById('studentsTableBody');

    try {
        console.log('Loading students for subject:', subjectId);

        // METHOD 1: Get students who have this subject in registeredSubjects (Individual Registration)
        const studentsQuery = query(
            collection(db, 'students'),
            where('registeredSubjects', 'array-contains', subjectId)
        );
        
        const studentsSnapshot = await getDocs(studentsQuery);
        
        // METHOD 2: Also get subject's enrolledStudents array (Bulk Registration)
        const subjectDoc = await getDoc(doc(db, 'subjects', subjectId));
        const enrolledStudentIds = subjectDoc.exists() ? (subjectDoc.data().enrolledStudents || []) : [];
        
        console.log('Students from registeredSubjects:', studentsSnapshot.size);
        console.log('Students from enrolledStudents:', enrolledStudentIds.length);

        // Collect all unique student documents
        const studentMap = new Map();
        
        // Add students from registeredSubjects query
        studentsSnapshot.forEach(doc => {
            studentMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
        
        // Add students from enrolledStudents array
        for (const enrolledId of enrolledStudentIds) {
            // Check if already added
            if (!studentMap.has(enrolledId)) {
                // Try to find student by document ID
                try {
                    const studentDoc = await getDoc(doc(db, 'students', enrolledId));
                    if (studentDoc.exists()) {
                        studentMap.set(studentDoc.id, { id: studentDoc.id, ...studentDoc.data() });
                    } else {
                        // Try to find by studentNumber or other fields
                        const allStudents = await getDocs(collection(db, 'students'));
                        allStudents.forEach(sDoc => {
                            const sData = sDoc.data();
                            if (sData.studentNumber === enrolledId || 
                                sData.rollNo === enrolledId || 
                                sData.email === enrolledId) {
                                studentMap.set(sDoc.id, { id: sDoc.id, ...sData });
                            }
                        });
                    }
                } catch (error) {
                    console.error('Error finding student:', enrolledId, error);
                }
            }
        }

        if (studentMap.size === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No students registered for this subject.</td></tr>';
            document.getElementById('studentCount').textContent = 'Total Students: 0';
            return;
        }

        tbody.innerHTML = '';
        let count = 0;

        // Display all unique students
        for (const [studentId, studentData] of studentMap) {
            try {
                console.log('Processing student:', studentData.name, studentId);
                
                // Calculate attendance percentage
                const attendancePercentage = await calculateAttendancePercentage(studentId, subjectId);
                
                const student = { 
                    ...studentData,
                    attendance: attendancePercentage
                };
                
                count++;

                const attendanceClass = attendancePercentage >= 90 ? 'attendance-high' :
                                          attendancePercentage >= 75 ? 'attendance-medium' :
                                          attendancePercentage >= 60 ? 'attendance-low' : 'attendance-critical';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="font-weight: 600;">${studentData.studentNumber || studentData.rollNo || studentData.email || studentId}</td>
                    <td>${studentData.name || 'N/A'}</td>
                    <td style="text-align: center;">
                        <span class="attendance-badge ${attendanceClass}">${attendancePercentage}%</span>
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-view" onclick="selectStudent(${JSON.stringify(student).replace(/"/g, '&quot;')})">
                            📅 View Details
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            } catch (error) {
                console.error('Error processing student:', studentId, error);
            }
        }

        document.getElementById('studentCount').textContent = `Total Students: ${count}`;
        
        // Auto-sync: Update subject's enrolledStudents with all found students
        await syncSubjectEnrollments(subjectId, Array.from(studentMap.values()));
        
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="error-message">Error loading students: ${error.message}</td></tr>`;
        console.error('Load students error:', error);
    }
}

// Sync subject's enrolledStudents array with actual registered students
async function syncSubjectEnrollments(subjectId, students) {
    try {
        const subjectRef = doc(db, 'subjects', subjectId);
        const subjectDoc = await getDoc(subjectRef);
        
        if (subjectDoc.exists()) {
            const enrolledStudents = new Set(subjectDoc.data().enrolledStudents || []);
            let updated = false;
            
            for (const student of students) {
                const identifier = student.studentNumber || student.rollNo || student.email || student.id;
                if (!enrolledStudents.has(identifier)) {
                    enrolledStudents.add(identifier);
                    updated = true;
                }
            }
            
            if (updated) {
                await updateDoc(subjectRef, {
                    enrolledStudents: Array.from(enrolledStudents)
                });
                console.log('✓ Synced enrolledStudents for subject:', subjectId);
            }
        }
    } catch (error) {
        console.error('Error syncing subject enrollments:', error);
    }
}

// Calculate attendance percentage for a specific student and subject
async function calculateAttendancePercentage(studentId, subjectId) {
    try {
        const q = query(
            collection(db, 'attendance'),
            where('studentId', '==', studentId),
            where('subjectId', '==', subjectId)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            return 0;
        }

        let totalClasses = 0;
        let presentCount = 0;

        querySnapshot.forEach((doc) => {
            const record = doc.data();
            totalClasses++;
            if (record.status === 'present') {
                presentCount++;
            }
        });

        const percentage = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;
        return percentage;
    } catch (error) {
        console.error('Error calculating attendance:', error);
        return 0;
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
                    📅 ${record.date || 'No date'}
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