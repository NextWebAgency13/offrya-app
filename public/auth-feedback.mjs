// Messages d'authentification : l'API n'a jamais le droit d'exposer
// un détail technique ou le statut d'un autre utilisateur.
export function authFeedback(error, operation = 'login') {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status);
  const duplicate = /^(user_already_exists|email_exists|email_already_exists|identity_already_exists)$/.test(code)
    || /(?:email|user) already (?:registered|exists)/.test(message);
  if (operation === 'signup' && duplicate) {
    return 'Si vous avez déjà un compte OFFRYA, utilisez « Connexion » ou « Mot de passe oublié ». Sinon, vérifiez votre boîte e-mail.';
  }
  if (/validez la vérification anti-robots|captcha verification failed|captcha_required|captcha_failed/.test(message) || /^(captcha_failed|captcha_required)$/.test(code)) {
    return 'Validez la vérification anti-robots, puis réessayez.';
  }
  if (code === 'email_not_confirmed') {
    return 'Votre adresse e-mail n’est pas encore confirmée. Vérifiez votre boîte de réception et vos courriers indésirables.';
  }
  if (code === 'invalid_credentials' || (operation === 'login' && status === 400 && /invalid login credentials/.test(message))) {
    return 'Adresse e-mail ou mot de passe incorrect. Vous pouvez réinitialiser votre mot de passe.';
  }
  if (status === 429 || /^(over_email_send_rate_limit|over_request_rate_limit|over_sms_send_rate_limit)$/.test(code)) {
    return 'Trop de tentatives. Veuillez réessayer plus tard.';
  }
  if (code === 'weak_password' || (operation === 'signup' && /password.*(?:weak|short)/.test(message))) {
    return 'Le mot de passe ne respecte pas les critères de sécurité. Choisissez un mot de passe plus robuste.';
  }
  if (code === 'email_address_invalid' || (code === 'validation_failed' && /email/.test(message))) {
    return 'Cette adresse e-mail est invalide. Vérifiez sa saisie.';
  }
  if (code === 'signup_disabled' || code === 'email_provider_disabled') {
    return 'La création de compte est temporairement indisponible. Réessayez ultérieurement.';
  }
  if (code === 'otp_expired' || code === 'otp_disabled') {
    return 'Ce lien a expiré ou n’est plus valide. Demandez un nouveau lien sécurisé.';
  }
  if (operation === 'signup') {
    return 'Impossible de finaliser l’inscription. Réessayez ou utilisez « Connexion » si vous avez déjà un compte.';
  }
  if (operation === 'reset') return 'Impossible d’envoyer le lien de récupération pour le moment. Réessayez ultérieurement.';
  if (operation === 'recover') return 'Impossible de modifier le mot de passe pour le moment. Réessayez ultérieurement.';
  return 'Connexion momentanément indisponible. Réessayez ultérieurement.';
}
