import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, addDoc, getDocs, query, where, doc, setDoc, getDoc, updateDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getDatabase, ref, push, set, get, child } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

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
const rtdb = getDatabase(app);

// Credit-to-Classes mapping (same as student dashboard)
const CLASSES_PER_CREDIT = {
    1: 15,
    2: 30,
    3: 45,
    4: 60,
    5: 75
};

// Global variables
let currentUser = null;
let currentSubject = null;
let currentStudent = null;
let currentFacultyData = null;
let timetableCache = [];

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
    
    // Load timetable cache
    await loadTimetableCache();
    
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

// Load timetable cache
async function loadTimetableCache() {
    try {
        const timetableSnapshot = await getDocs(collection(db, 'timetable'));
        timetableCache = [];
        timetableSnapshot.forEach(doc => {
            timetableCache.push({ id: doc.id, ...doc.data() });
        });
        console.log(`Loaded ${timetableCache.length} timetable entries`);
    } catch (error) {
        console.error('Error loading timetable:', error);
    }
}

// Match attendance with timetable (same logic as student dashboard)
function matchAttendanceWithTimetable(attendanceDate, attendanceTime) {
    try {
        const dateObj = new Date(attendanceDate);
        const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        
        let timeHHMM = attendanceTime;
        if (attendanceTime && attendanceTime.split(':').length === 3) {
            const parts = attendanceTime.split(':');
            timeHHMM = `${parts[0]}:${parts[1]}`;
        }
        
        for (const timetable of timetableCache) {
            if (timetable.day === dayOfWeek) {
                const startTime = timetable.startTime || "00:00";
                const endTime = timetable.endTime || "23:59";
                
                if (timeHHMM >= startTime && timeHHMM < endTime) {
                    return timetable.subjectCode;
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error("Error matching timetable:", error);
        return null;
    }
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

// Load students - UPDATED WITH CREDIT-BASED CALCULATION
async function loadStudents(subjectId) {
    const tbody = document.getElementById('studentsTableBody');

    try {
        console.log('Loading students for subject:', subjectId);

        // Get subject data first
        const subjectDoc = await getDoc(doc(db, 'subjects', subjectId));
        if (!subjectDoc.exists()) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Subject not found.</td></tr>';
            document.getElementById('studentCount').textContent = 'Total Students: 0';
            return;
        }

        const subjectData = subjectDoc.data();
        const credits = subjectData.credits || 3;
        const totalClassesForSubject = subjectData.totalClasses || CLASSES_PER_CREDIT[credits] || (credits * 15);

        console.log(`Subject: ${subjectId}, Credits: ${credits}, Total Classes: ${totalClassesForSubject}`);

        // Get students who have this subject in registeredSubjects
        const studentsQuery = query(
            collection(db, 'students'),
            where('registeredSubjects', 'array-contains', subjectId)
        );
        
        const studentsSnapshot = await getDocs(studentsQuery);
        
        // Also get subject's enrolledStudents array (for bulk registration)
        const enrolledStudentIds = subjectData.enrolledStudents || [];

        // Get all attendance records from Realtime Database
        const attendanceRef = ref(rtdb, 'attendance');
        const attendanceSnapshot = await get(attendanceRef);
        
        let allAttendanceRecords = [];
        
        if (attendanceSnapshot.exists()) {
            const attendanceData = attendanceSnapshot.val();
            
            Object.keys(attendanceData).forEach(key => {
                const record = attendanceData[key];
                let subjectCode = record.subjectCode || null;
                
                // If no subjectCode, try to match with timetable
                if (!subjectCode && record.date && record.time) {
                    subjectCode = matchAttendanceWithTimetable(record.date, record.time);
                }
                
                allAttendanceRecords.push({
                    studentID: record.studentID,
                    date: record.date,
                    time: record.time,
                    status: record.status || "present",
                    subjectCode: subjectCode
                });
            });
            
            console.log(`Total attendance records: ${allAttendanceRecords.length}`);
        }

        // Collect unique students
        const studentMap = new Map();
        
        studentsSnapshot.forEach(doc => {
            studentMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
        
        // Add students from enrolledStudents array
        for (const enrolledId of enrolledStudentIds) {
            if (!studentMap.has(enrolledId)) {
                try {
                    const studentDoc = await getDoc(doc(db, 'students', enrolledId));
                    if (studentDoc.exists()) {
                        studentMap.set(studentDoc.id, { id: studentDoc.id, ...studentDoc.data() });
                    } else {
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

        // Display all students with credit-based attendance
        for (const [studentId, studentData] of studentMap) {
            try {
                const studentNumber = studentData.studentNumber || studentData.rollNo || studentData.email || studentId;
                
                // Filter attendance for this student and subject
                const subjectAttendance = allAttendanceRecords.filter(record => 
                    record.studentID === studentNumber && record.subjectCode === subjectId
                );
                
                const presentCount = subjectAttendance.filter(r => r.status === "present").length;
                
                // Calculate percentage based on total classes for the subject
                const attendancePercentage = totalClassesForSubject > 0 
                    ? Math.round((presentCount / totalClassesForSubject) * 100)
                    : 0;
                
                console.log(`Student ${studentNumber}: ${presentCount}/${totalClassesForSubject} = ${attendancePercentage}%`);
                
                const student = { 
                    ...studentData,
                    attendance: attendancePercentage,
                    presentCount: presentCount,
                    totalClasses: totalClassesForSubject
                };
                
                count++;

                const attendanceClass = attendancePercentage >= 90 ? 'attendance-high' :
                                          attendancePercentage >= 75 ? 'attendance-medium' :
                                          attendancePercentage >= 60 ? 'attendance-low' : 'attendance-critical';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="font-weight: 600;">${studentNumber}</td>
                    <td>${studentData.name || 'N/A'}</td>
                    <td style="text-align: center;">
                        <span class="attendance-badge ${attendanceClass}">${attendancePercentage}%</span>
                        <br><small style="color: #666;">(${presentCount}/${totalClassesForSubject})</small>
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
        
        // Auto-sync enrolledStudents
        await syncSubjectEnrollments(subjectId, Array.from(studentMap.values()));
        
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="error-message">Error loading students: ${error.message}</td></tr>`;
        console.error('Load students error:', error);
    }
}

// Sync subject's enrolledStudents array
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

// Select student
function selectStudent(student) {
    currentStudent = student;
    showStudentDetails();
}

// Load attendance records from Realtime Database
async function loadAttendanceRecords(studentId, subjectId) {
    const recordsList = document.getElementById('recordsList');

    try {
        const studentDoc = await getDoc(doc(db, 'students', studentId));
        if (!studentDoc.exists()) {
            recordsList.innerHTML = '<div class="error-message">Student not found.</div>';
            return;
        }
        
        const studentData = studentDoc.data();
        const studentNumber = studentData.studentNumber || studentData.rollNo || studentData.email || studentId;

        const attendanceRef = ref(rtdb, 'attendance');
        const snapshot = await get(attendanceRef);

        if (!snapshot.exists()) {
            recordsList.innerHTML = '<div class="empty-state">No attendance records available.</div>';
            return;
        }

        const attendanceData = snapshot.val();
        const matchingRecords = [];

        for (const recordId in attendanceData) {
            const record = attendanceData[recordId];
            
            let subjectCode = record.subjectCode;
            if (!subjectCode && record.date && record.time) {
                subjectCode = matchAttendanceWithTimetable(record.date, record.time);
            }
            
            if (record.studentID === studentNumber && subjectCode === subjectId) {
                matchingRecords.push({
                    date: record.date,
                    time: record.time,
                    status: record.status || "present"
                });
            }
        }

        if (matchingRecords.length === 0) {
            recordsList.innerHTML = '<div class="empty-state">No attendance records available.</div>';
            return;
        }

        matchingRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

        recordsList.innerHTML = '';

        matchingRecords.forEach((record) => {
            const item = document.createElement('div');
            item.className = 'record-item';
            item.innerHTML = `
                <div class="record-date">
                    📅 ${record.date} at ${record.time}
                </div>
                <span class="status-badge ${record.status === 'present' ? 'status-present' : 'status-absent'}">
                    ${record.status === 'present' ? 'Present' : 'Absent'}
                </span>
            `;
            recordsList.appendChild(item);
        });
    } catch (error) {
        recordsList.innerHTML = '<div class="error-message">Error loading records: ' + error.message + '</div>';
        console.error('Error loading attendance records:', error);
    }
}

// Get current subject from timetable
async function getCurrentSubjectFromTimetable(studentData) {
    try {
        const now = new Date();
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const timetableQuery = query(
            collection(db, 'timetable'),
            where('semester', '==', studentData.year || 5),
            where('day', '==', currentDay)
        );

        const timetableSnapshot = await getDocs(timetableQuery);

        if (timetableSnapshot.empty) {
            return null;
        }

        for (const timetableDoc of timetableSnapshot.docs) {
            const timetableData = timetableDoc.data();
            
            const [startHour, startMin] = timetableData.startTime.split(':').map(Number);
            const [endHour, endMin] = timetableData.endTime.split(':').map(Number);
            
            const startTime = startHour * 60 + startMin;
            const endTime = endHour * 60 + endMin;

            if (currentTime >= startTime && currentTime <= endTime) {
                return {
                    subjectCode: timetableData.subjectCode,
                    startTime: timetableData.startTime,
                    endTime: timetableData.endTime,
                    room: timetableData.room
                };
            }
        }

        return null;
    } catch (error) {
        console.error('Error getting current subject from timetable:', error);
        return null;
    }
}

// Mark attendance in Realtime Database
async function markAttendanceForStudent(studentId, fingerID, status = 'present') {
    try {
        const studentDoc = await getDoc(doc(db, 'students', studentId));
        if (!studentDoc.exists()) {
            throw new Error('Student not found');
        }

        const studentData = studentDoc.data();
        const currentSubject = await getCurrentSubjectFromTimetable(studentData);
        
        if (!currentSubject) {
            return { success: false, message: 'No class scheduled at this time' };
        }

        const registeredSubjects = studentData.registeredSubjects || [];
        if (!registeredSubjects.includes(currentSubject.subjectCode)) {
            return { success: false, message: `Student not registered for ${currentSubject.subjectCode}` };
        }

        const attendanceRef = ref(rtdb, 'attendance');
        const newAttendanceRef = push(attendanceRef);
        
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const timeStr = today.toTimeString().split(' ')[0].substring(0, 8);

        const attendanceRecord = {
            date: dateStr,
            time: timeStr,
            studentID: studentData.studentNumber || studentData.rollNo || studentId,
            studentName: studentData.name,
            subjectCode: currentSubject.subjectCode,
            fingerID: fingerID,
            status: status
        };

        await set(newAttendanceRef, attendanceRecord);
        
        return { 
            success: true, 
            message: `Attendance marked for ${currentSubject.subjectCode}`,
            record: attendanceRecord
        };
    } catch (error) {
        console.error('Error marking attendance:', error);
        return { success: false, message: error.message };
    }
}

window.markAttendanceForStudent = markAttendanceForStudent;