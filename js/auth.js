import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabase = createClient(
    'https://htwevjqqqyojcbgeevqy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0d2V2anFxcXlvamNiZ2VldnF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDg0NzYsImV4cCI6MjA2ODg4NDQ3Nn0.lszlnu4aWcDRAhp_MjJaECRFzGYze_uP7GhfWszA6fY'
)

const logoutBtn = document.getElementById('logoutBtn')
logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.href = '../index.html'
})

const form = document.getElementById('login-form');
const errorMessageEl = document.getElementById('error-message');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessageEl.textContent = '';

    const email = form.email.value.trim();
    const password = form.password.value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        errorMessageEl.textContent = error.message;
    } else {
        // Success! Redirect or update UI
        window.location.href = 'html/chat.html'; // redirect to chat page
    }
});
