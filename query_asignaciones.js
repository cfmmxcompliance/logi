import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB-xxxxx", // Wait, I don't need the real API key if I use firebase-admin. 
};
