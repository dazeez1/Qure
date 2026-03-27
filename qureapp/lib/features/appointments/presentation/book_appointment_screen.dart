import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/ui/app_toast.dart';
import '../../dashboard/data/patient_dashboard_api.dart';
import '../../profile/data/patient_profile_api.dart';
import '../../profile/domain/patient_profile_models.dart';
import '../../shell/presentation/patient_top_bar.dart';
import '../data/patient_appointments_api.dart';
import '../data/public_directory_api.dart';

const Color _kBorder = Color(0xFFE6E8EC);
const Color _kTitle = Color(0xFF111827);
const Color _kMuted = Color(0xFF6B7280);
const Color _kNavy = Color(0xFF0B2E7A);

const _visitReasons = <String>[
  'General consultation',
  'Follow-up visit',
  'Lab results review',
  'Prescription refill',
  'Emergency / urgent care',
  'Other',
];

final _publicHospitalsProvider =
    FutureProvider.autoDispose<List<PublicHospitalOption>>((ref) async {
  return ref.watch(publicDirectoryApiProvider).fetchHospitals();
});

final _publicDepartmentsProvider = FutureProvider.autoDispose
    .family<List<PublicDepartmentOption>, String>((ref, hospitalId) async {
  return ref.watch(publicDirectoryApiProvider).fetchDepartments(hospitalId);
});

final _bookingProfileProvider =
    FutureProvider.autoDispose<PatientProfileDetails>((ref) async {
  return ref.watch(patientProfileApiProvider).getMe();
});

class BookAppointmentScreen extends ConsumerStatefulWidget {
  const BookAppointmentScreen({super.key});

  @override
  ConsumerState<BookAppointmentScreen> createState() =>
      _BookAppointmentScreenState();
}

class _BookAppointmentScreenState extends ConsumerState<BookAppointmentScreen> {
  String? _hospitalId;
  String? _departmentId;
  String? _reasonChoice;
  final _otherReasonController = TextEditingController();
  final _phoneController = TextEditingController();

  DateTime? _selectedDate;
  TimeOfDay? _selectedTime;

  bool _submitting = false;

  @override
  void dispose() {
    _otherReasonController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _loadPhoneOnce(WidgetRef ref) async {
    if (_phoneController.text.isNotEmpty) {
      return;
    }
    try {
      final me = await ref.read(patientProfileApiProvider).getMe();
      if (mounted) {
        setState(() {
          _phoneController.text = me.phone ?? '';
        });
      }
    } catch (_) {}
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadPhoneOnce(ref);
    });
  }

  String _formatDateDdMmYyyy(DateTime d) {
    final dd = d.day.toString().padLeft(2, '0');
    final mm = d.month.toString().padLeft(2, '0');
    return '$dd/$mm/${d.year}';
  }

  String _formatTimeDisplay(TimeOfDay t) {
    final now = DateTime.now();
    final dt = DateTime(now.year, now.month, now.day, t.hour, t.minute);
    final h12 = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    final p = dt.hour >= 12 ? 'PM' : 'AM';
    return '$h12 : $m$p';
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _selectedDate ?? now.add(const Duration(days: 1)),
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (d != null) {
      setState(() => _selectedDate = d);
    }
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(
      context: context,
      initialTime: _selectedTime ?? const TimeOfDay(hour: 10, minute: 0),
    );
    if (t != null) {
      setState(() => _selectedTime = t);
    }
  }

  String _composeReason() {
    final choice = _reasonChoice;
    if (choice == null || choice.isEmpty) {
      return '';
    }
    if (choice == 'Other') {
      return _otherReasonController.text.trim().isEmpty
          ? 'Other'
          : _otherReasonController.text.trim();
    }
    return choice;
  }

  Future<void> _submit() async {
    if (_hospitalId == null || _departmentId == null) {
      await AppToast.showError(context, message: 'Select hospital and department.');
      return;
    }
    if (_selectedDate == null || _selectedTime == null) {
      await AppToast.showError(context, message: 'Select date and time.');
      return;
    }
    final when = DateTime(
      _selectedDate!.year,
      _selectedDate!.month,
      _selectedDate!.day,
      _selectedTime!.hour,
      _selectedTime!.minute,
    );
    if (!when.isAfter(DateTime.now())) {
      await AppToast.showError(context, message: 'Choose a future date and time.');
      return;
    }
    final reason = _composeReason();
    if (reason.isEmpty) {
      await AppToast.showError(context, message: 'Select a reason for visit.');
      return;
    }

    setState(() => _submitting = true);
    try {
      final phone = _phoneController.text.trim();
      if (phone.isNotEmpty) {
        await ref.read(patientProfileApiProvider).updateProfile(phone: phone);
        if (!mounted) {
          return;
        }
      }

      await ref.read(patientAppointmentsApiProvider).createAppointment(
            hospitalId: _hospitalId!,
            departmentId: _departmentId!,
            appointmentDate: when,
            reason: reason,
          );

      if (!mounted) {
        return;
      }
      await AppToast.showSuccess(context, message: 'Appointment booked.');
      if (!mounted) {
        return;
      }
      ref.invalidate(patientDashboardProvider);
      ref.invalidate(_bookingProfileProvider);
      ref.invalidate(patientAppointmentsProvider(null));
      ref.invalidate(patientAppointmentsProvider('COMPLETED'));
      ref.invalidate(patientAppointmentsProvider('CANCELLED'));
      context.pop();
    } on ApiException catch (e) {
      if (!mounted) {
        return;
      }
      await AppToast.showError(context, message: e.message);
    } catch (e) {
      if (!mounted) {
        return;
      }
      await AppToast.showError(context, message: e.toString());
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final hospitals = ref.watch(_publicHospitalsProvider);
    final departments = _hospitalId != null
        ? ref.watch(_publicDepartmentsProvider(_hospitalId!))
        : null;
    final profile = ref.watch(_bookingProfileProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: PatientTopBar(),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Book Appointment',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: _kTitle,
                        height: 1.15,
                      ),
                    ),
                    const SizedBox(height: 24),
                    const _FieldLabel('Hospital/Clinic'),
                    const SizedBox(height: 8),
                    hospitals.when(
                      data: (list) => _OutlineDropdown<String>(
                        value: _hospitalId,
                        hint: 'Select Hospital',
                        items: list
                            .map(
                              (h) => DropdownMenuItem(
                                value: h.id,
                                child: Text(h.name, overflow: TextOverflow.ellipsis),
                              ),
                            )
                            .toList(),
                        onChanged: _submitting
                            ? null
                            : (v) => setState(() {
                                  _hospitalId = v;
                                  _departmentId = null;
                                }),
                      ),
                      loading: () => const LinearProgressIndicator(minHeight: 2),
                      error: (e, _) => Text(
                        e.toString(),
                        style: TextStyle(color: Theme.of(context).colorScheme.error),
                      ),
                    ),
                    const SizedBox(height: 18),
                    const _FieldLabel('Service/Department'),
                    const SizedBox(height: 8),
                    if (_hospitalId == null)
                      const Text(
                        'Select a hospital first.',
                        style: TextStyle(color: _kMuted, fontSize: 13.5),
                      )
                    else
                      departments!.when(
                        data: (list) => _OutlineDropdown<String>(
                          value: _departmentId,
                          hint: 'Select Department',
                          items: list
                              .map(
                                (d) => DropdownMenuItem(
                                  value: d.id,
                                  child: Text(d.name, overflow: TextOverflow.ellipsis),
                                ),
                              )
                              .toList(),
                          onChanged:
                              _submitting ? null : (v) => setState(() => _departmentId = v),
                        ),
                        loading: () => const LinearProgressIndicator(minHeight: 2),
                        error: (e, _) => Text(e.toString()),
                      ),
                    const SizedBox(height: 18),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const _FieldLabel('Date'),
                              const SizedBox(height: 8),
                              InkWell(
                                onTap: _submitting ? null : _pickDate,
                                borderRadius: BorderRadius.circular(12),
                                child: InputDecorator(
                                  decoration: _fieldDecoration(),
                                  child: Text(
                                    _selectedDate == null
                                        ? 'DD/MM/YYYY'
                                        : _formatDateDdMmYyyy(_selectedDate!),
                                    style: TextStyle(
                                      color: _selectedDate == null ? _kMuted : _kTitle,
                                      fontSize: 14.5,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const _FieldLabel('Time'),
                              const SizedBox(height: 8),
                              InkWell(
                                onTap: _submitting ? null : _pickTime,
                                borderRadius: BorderRadius.circular(12),
                                child: InputDecorator(
                                  decoration: _fieldDecoration(),
                                  child: Text(
                                    _selectedTime == null
                                        ? '10 : 34AM'
                                        : _formatTimeDisplay(_selectedTime!),
                                    style: TextStyle(
                                      color: _selectedTime == null ? _kMuted : _kTitle,
                                      fontSize: 14.5,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    const _FieldLabel('Phone Number'),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _phoneController,
                      enabled: !_submitting,
                      keyboardType: TextInputType.phone,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s-]')),
                      ],
                      decoration: _fieldDecoration(hint: 'Enter your Phone Number'),
                    ),
                    const SizedBox(height: 28),
                    const Text(
                      'Patient Details',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: _kTitle,
                      ),
                    ),
                    const SizedBox(height: 16),
                    profile.when(
                      data: (me) => Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const _FieldLabel('Full name'),
                          const SizedBox(height: 8),
                          _ReadOnlyField(text: me.fullName.toUpperCase()),
                          const SizedBox(height: 18),
                          const _FieldLabel('Gender'),
                          const SizedBox(height: 8),
                          _ReadOnlyField(text: (me.gender ?? '—').toUpperCase()),
                        ],
                      ),
                      loading: () => const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: LinearProgressIndicator(minHeight: 2),
                      ),
                      error: (_, _) => const SizedBox.shrink(),
                    ),
                    const SizedBox(height: 18),
                    const _FieldLabel('Reason for Visit'),
                    const SizedBox(height: 8),
                    _OutlineDropdown<String>(
                      value: _reasonChoice,
                      hint: 'Reason For Visit',
                      items: _visitReasons
                          .map(
                            (r) => DropdownMenuItem(
                              value: r,
                              child: Text(r),
                            ),
                          )
                          .toList(),
                      onChanged:
                          _submitting ? null : (v) => setState(() => _reasonChoice = v),
                    ),
                    if (_reasonChoice == 'Other') ...[
                      const SizedBox(height: 16),
                      const _FieldLabel('If Other Specify'),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _otherReasonController,
                        enabled: !_submitting,
                        maxLines: 4,
                        decoration: _fieldDecoration(hint: 'Add details…'),
                      ),
                    ],
                    const SizedBox(height: 28),
                    SizedBox(
                      height: 50,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: _kNavy,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onPressed: _submitting ? null : _submit,
                        child: _submitting
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text(
                                'Book Appointment',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ),
                    const SizedBox(height: 28),
                    const _BookFooter(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReadOnlyField extends StatelessWidget {
  const _ReadOnlyField({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorder),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 14.5,
          color: Colors.grey.shade600,
          fontWeight: FontWeight.w500,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: _kTitle,
      ),
    );
  }
}

InputDecoration _fieldDecoration({String? hint}) {
  return InputDecoration(
    hintText: hint,
    hintStyle: TextStyle(color: Colors.grey.shade500, fontSize: 14.5),
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: _kBorder),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: _kBorder),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xFF0B3F9A), width: 1.4),
    ),
  );
}

class _OutlineDropdown<T> extends StatelessWidget {
  const _OutlineDropdown({
    required this.value,
    required this.hint,
    required this.items,
    required this.onChanged,
  });

  final T? value;
  final String hint;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?>? onChanged;

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      decoration: _fieldDecoration(),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          isExpanded: true,
          hint: Text(hint, style: TextStyle(color: Colors.grey.shade500, fontSize: 14.5)),
          value: value,
          items: items,
          onChanged: onChanged,
          icon: const Icon(Icons.keyboard_arrow_down_rounded),
        ),
      ),
    );
  }
}

class _BookFooter extends StatelessWidget {
  const _BookFooter();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '© 2025 Qure Nigeria. All rights reserved.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500),
        ),
        const SizedBox(height: 8),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 6,
          runSpacing: 4,
          children: [
            TextButton(
              onPressed: () => AppToast.showInfo(
                context,
                message: 'Privacy Policy screen will be added next.',
              ),
              child: Text(
                'Privacy Policy',
                style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
              ),
            ),
            Text('•', style: TextStyle(color: Colors.grey.shade500)),
            TextButton(
              onPressed: () => context.push('/terms'),
              child: Text(
                'Terms of Service',
                style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
              ),
            ),
            Text('•', style: TextStyle(color: Colors.grey.shade500)),
            TextButton(
              onPressed: () => AppToast.showInfo(
                context,
                message: 'Cookie settings are not used in the mobile app.',
              ),
              child: Text(
                'Cookie Settings',
                style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
