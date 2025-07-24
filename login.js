document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = e.target.email.value.trim();
  const password = e.target.password.value;

  const errorMessageEl = document.getElementById('error-message');
  errorMessageEl.textContent = '';

  try {
    // Example: Replace this with your real login logic, e.g., Supabase auth
    // Simulated async login check:
    if (email === 'test@example.com' && password === 'password123') {
      alert('Login successful! Redirecting...');
      window.location.href = 'chat.html'; // Redirect to chat page
    } else {
      throw new Error('Invalid email or password');
    }
  } catch (error) {
    errorMessageEl.textContent = error.message;
  }
});
