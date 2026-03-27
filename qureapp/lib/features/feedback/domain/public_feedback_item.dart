class PublicFeedbackItem {
  const PublicFeedbackItem({
    required this.id,
    required this.rating,
    required this.comment,
    required this.patientName,
    required this.doctorName,
    required this.departmentName,
    required this.appointmentDate,
  });

  final String id;
  final int rating;
  final String? comment;
  final String patientName;
  final String? doctorName;
  final String departmentName;
  final DateTime appointmentDate;

  factory PublicFeedbackItem.fromJson(Map<String, dynamic> json) {
    return PublicFeedbackItem(
      id: json['id'] as String,
      rating: json['rating'] is int ? json['rating'] as int : int.tryParse('${json['rating']}') ?? 0,
      comment: json['comment'] as String?,
      patientName: json['patientName'] as String? ?? '',
      doctorName: json['doctorName'] as String?,
      departmentName: json['departmentName'] as String? ?? '',
      appointmentDate:
          DateTime.parse(json['date'] as String),
    );
  }
}
