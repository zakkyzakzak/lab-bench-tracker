// Firebase web settings for the lab-bench-tracker project.
// These values identify the project to the browser; they are not secrets. Access to data is
// controlled by firestore.rules and by Google sign-in, not by hiding this file.
export const firebaseConfig = {
  apiKey: 'AIzaSyAIdI0mTSnB4Y-l-VWGqrrgXrow_fbby9c',
  authDomain: 'lab-bench-tracker.firebaseapp.com',
  projectId: 'lab-bench-tracker',
  storageBucket: 'lab-bench-tracker.firebasestorage.app',
  messagingSenderId: '714894705915',
  appId: '1:714894705915:web:ca5c976756842d1dce1c5e',
};

// The one account allowed to do the one-time lab setup (becomes lab admin).
export const LAB_OWNER = '2304452@students.wits.ac.za';
