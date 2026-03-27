import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/application/auth_controller.dart';
import '../../dashboard/data/patient_dashboard_api.dart';
import '../../patient/application/patient_hospital_context_provider.dart';
import '../../shell/presentation/patient_top_bar.dart';
import '../data/patient_queue_api.dart';
import '../data/queue_preview_api.dart';
import '../domain/queue_preview_models.dart';

const Color _kTitle = Color(0xFF111827);
const Color _kMuted = Color(0xFF6B7280);
const Color _kCardBlue = Color(0xFFE8F2FC);
const Color _kPrimaryDark = Color(0xFF0B2E7A);
const Color _kWaitingGrey = Color(0xFF6B7280);

final queuePreviewListProvider =
    FutureProvider.autoDispose<List<QueuePreviewEntry>>((ref) async {
  final hid = await ref.watch(patientResolvedHospitalIdProvider.future);
  if (hid == null || hid.isEmpty) {
    return [];
  }
  return ref.watch(queuePreviewApiProvider).fetchPreview(hospitalId: hid);
});

class QueueStatusScreen extends ConsumerStatefulWidget {
  const QueueStatusScreen({super.key});

  @override
  ConsumerState<QueueStatusScreen> createState() => _QueueStatusScreenState();
}

class _QueueStatusScreenState extends ConsumerState<QueueStatusScreen> {
  DateTime _lastUpdated = DateTime.now();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  Future<void> _refresh() async {
    ref.invalidate(patientResolvedHospitalIdProvider);
    ref.invalidate(patientQueueStatusProvider);
    ref.invalidate(patientDashboardProvider);
    ref.invalidate(queuePreviewListProvider);
    try {
      await ref.read(queuePreviewListProvider.future);
    } catch (_) {}
    if (mounted) {
      setState(() {
        _lastUpdated = DateTime.now();
      });
    }
  }

  String _secondsAgoText() {
    final s = DateTime.now().difference(_lastUpdated).inSeconds;
    if (s < 5) {
      return 'Updated just now';
    }
    return 'Updated $s secs ago';
  }

  @override
  Widget build(BuildContext context) {
    final patientId = ref.watch(authControllerProvider).patient?.id;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: RefreshIndicator(
          color: const Color(0xFF0B3F9A),
          onRefresh: _refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const PatientTopBar(),
                      const SizedBox(height: 20),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Expanded(
                            child: Text(
                              'Real-Time Queue Tracking',
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                                color: _kTitle,
                                height: 1.15,
                              ),
                            ),
                          ),
                          IconButton(
                            onPressed: _refresh,
                            icon: const Icon(Icons.refresh_rounded, color: _kTitle),
                            tooltip: 'Refresh',
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _secondsAgoText(),
                        style: const TextStyle(
                          fontSize: 13,
                          color: _kMuted,
                        ),
                      ),
                      const SizedBox(height: 20),
                    ],
                  ),
                ),
              ),
              Consumer(
                builder: (context, ref, _) {
                  final hidAsync = ref.watch(patientResolvedHospitalIdProvider);
                  final previewAsync = ref.watch(queuePreviewListProvider);

                  return hidAsync.when(
                    data: (hid) {
                      if (hid == null || hid.isEmpty) {
                        return SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            child: Text(
                              'Book an appointment or join a queue to see live tracking for your hospital.',
                              style: TextStyle(color: Colors.grey.shade700, height: 1.35),
                            ),
                          ),
                        );
                      }
                      return previewAsync.when(
                        data: (entries) {
                          if (entries.isEmpty) {
                            return const SliverToBoxAdapter(
                              child: Padding(
                                padding: EdgeInsets.symmetric(horizontal: 20),
                                child: Text(
                                  'No active queue entries right now.',
                                  style: TextStyle(color: _kMuted),
                                ),
                              ),
                            );
                          }
                          return SliverPadding(
                            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                            sliver: SliverList(
                              delegate: SliverChildBuilderDelegate(
                                (context, index) {
                                  final e = entries[index];
                                  final isYou =
                                      patientId != null && e.patientId == patientId;
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 14),
                                    child: _QueueTrackingCard(
                                      entry: e,
                                      highlightYou: isYou,
                                    ),
                                  );
                                },
                                childCount: entries.length,
                              ),
                            ),
                          );
                        },
                        loading: () => const SliverToBoxAdapter(
                          child: Center(
                            child: Padding(
                              padding: EdgeInsets.all(32),
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        ),
                        error: (e, _) => SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            child: Text(
                              e.toString(),
                              style: TextStyle(color: Theme.of(context).colorScheme.error),
                            ),
                          ),
                        ),
                      );
                    },
                    loading: () => const SliverToBoxAdapter(
                      child: Center(
                        child: Padding(
                          padding: EdgeInsets.all(32),
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    ),
                    error: (e, _) => SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Text(e.toString()),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QueueTrackingCard extends StatelessWidget {
  const _QueueTrackingCard({
    required this.entry,
    required this.highlightYou,
  });

  final QueuePreviewEntry entry;
  final bool highlightYou;

  bool get _isNextStyle =>
      entry.status == 'CALLED' || entry.status == 'IN_CONSULTATION';

  @override
  Widget build(BuildContext context) {
    final waitLabel = entry.waitTimeDisplay ??
        (entry.estimatedWait == null ? '—' : '${entry.estimatedWait} min');

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      decoration: BoxDecoration(
        color: _kCardBlue,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Patient',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: _kTitle,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      entry.patientName,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: _kTitle,
                      ),
                    ),
                  ],
                ),
              ),
              if (highlightYou)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: _kPrimaryDark,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'YOUR POSITION',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            'Service',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: _kTitle,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            entry.departmentName,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14.5, color: _kTitle),
          ),
          const SizedBox(height: 14),
          const Text(
            'Waiting Time',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: _kTitle,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            waitLabel,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14.5, color: _kTitle),
          ),
          const SizedBox(height: 16),
          const Text(
            'Status',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: _kTitle,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: _isNextStyle ? _kPrimaryDark : _kWaitingGrey,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: Text(
                  _isNextStyle ? 'Next' : 'Waiting',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
