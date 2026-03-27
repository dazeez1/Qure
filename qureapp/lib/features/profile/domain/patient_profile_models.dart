class PatientProfileDetails {
  const PatientProfileDetails({
    required this.id,
    required this.fullName,
    required this.email,
    required this.phone,
    required this.gender,
    required this.dateOfBirth,
    required this.avatarUrl,
    required this.emailNotificationsEnabled,
    required this.pushNotificationsEnabled,
  });

  final String id;
  final String fullName;
  final String email;
  final String? phone;
  final String? gender;
  final DateTime? dateOfBirth;
  final String? avatarUrl;
  final bool emailNotificationsEnabled;
  final bool pushNotificationsEnabled;
}

