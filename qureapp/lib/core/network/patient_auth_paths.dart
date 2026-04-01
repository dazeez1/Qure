/// True when a 401 on this request must **not** trigger global session logout.
///
/// Wrong credentials on login/register return 401; clearing stored tokens there
/// would incorrectly sign the user out of an unrelated (or non-existent) session.
bool isPatientAuthCredentialPath(String path) {
  return path.contains('/patient/auth/login') ||
      path.contains('/patient/auth/register');
}
