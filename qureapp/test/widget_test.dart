import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:qureapp/app/app.dart';

void main() {
  testWidgets('App boots to a widget tree', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: QurePatientApp()));
    await tester.pump();

    expect(find.byType(QurePatientApp), findsOneWidget);
  });
}
