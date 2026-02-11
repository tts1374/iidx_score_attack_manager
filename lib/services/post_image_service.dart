import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/constants.dart';

class PostImageData {
  PostImageData({
    required this.qrData,
    required this.title,
    required this.period,
    required this.hashtag,
    required this.charts,
    this.background,
  });

  final String qrData;
  final String title;
  final String period;
  final String hashtag;
  final List<PostChartLine> charts;
  final ui.Image? background;
}

class PostChartLine {
  PostChartLine({
    required this.version,
    required this.title,
    required this.playStyle,
    required this.difficulty,
    required this.level,
  });

  final String version;
  final String title;
  final String playStyle;
  final String difficulty;
  final int level;
}

class PostImageService {
  static const double _horizontalPadding = 80;

  Future<Uint8List> generate(PostImageData data) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final size = Size(postImageWidth.toDouble(), postImageHeight.toDouble());

    _drawBackground(canvas, size, data.background);

    double y = 70;
    y = _drawCenteredOutlinedText(
      canvas,
      data.title,
      y,
      fontSize: 72,
      fontWeight: FontWeight.w700,
      color: Colors.white,
      strokeColor: const Color(0xFF16264C),
      strokeWidth: 7,
      maxLines: 2,
    );

    y += 36;
    y = _drawCenteredOutlinedText(
      canvas,
      '開催期間',
      y,
      fontSize: 50,
      fontWeight: FontWeight.w600,
      color: Colors.white,
      strokeColor: const Color(0xFF16264C),
      strokeWidth: 6,
    );

    y += 18;
    y = _drawCenteredOutlinedText(
      canvas,
      data.period,
      y,
      fontSize: 48,
      fontWeight: FontWeight.w500,
      color: Colors.white,
      strokeColor: const Color(0xFF16264C),
      strokeWidth: 6,
    );

    y += 56;
    y = await _drawCenteredQr(canvas, data.qrData, y);

    y += 84;
    y = _drawCenteredOutlinedText(
      canvas,
      '対象曲',
      y,
      fontSize: 50,
      fontWeight: FontWeight.w600,
      color: Colors.white,
      strokeColor: const Color(0xFF16264C),
      strokeWidth: 6,
    );

    y += 20;
    final list = data.charts.take(4).toList();
    for (final chart in list) {
      y = _drawSongRow(canvas, chart, y);
      y += 24;
    }

    _drawBottomHashtag(canvas, size, '#${data.hashtag}');

    final picture = recorder.endRecording();
    final image = await picture.toImage(postImageWidth, postImageHeight);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    return byteData!.buffer.asUint8List();
  }

  void _drawBackground(Canvas canvas, Size size, ui.Image? background) {
    if (background != null) {
      final dst = Offset.zero & size;
      final src = Rect.fromLTWH(
        0,
        0,
        background.width.toDouble(),
        background.height.toDouble(),
      );
      canvas.drawImageRect(background, src, dst, Paint());
      return;
    }

    final rect = Offset.zero & size;
    final gradient = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Color(0xFF191D3D),
          Color(0xFF111A38),
        ],
      ).createShader(rect);
    canvas.drawRect(rect, gradient);
  }

  double _drawCenteredOutlinedText(
    Canvas canvas,
    String text,
    double top, {
    required double fontSize,
    required FontWeight fontWeight,
    required Color color,
    required Color strokeColor,
    required double strokeWidth,
    int maxLines = 1,
  }) {
    final strokeSpan = TextSpan(
      text: text,
      style: TextStyle(
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 1.2,
        foreground: Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = strokeWidth
          ..color = strokeColor,
      ),
    );
    final fillSpan = TextSpan(
      text: text,
      style: TextStyle(
        color: color,
        fontSize: fontSize,
        fontWeight: fontWeight,
        height: 1.2,
      ),
    );

    final strokePainter = TextPainter(
      text: strokeSpan,
      textDirection: TextDirection.ltr,
      maxLines: maxLines,
      ellipsis: '...',
      textAlign: TextAlign.center,
    );
    strokePainter.layout(maxWidth: postImageWidth - _horizontalPadding * 2);
    final left = (postImageWidth - strokePainter.width) / 2;
    strokePainter.paint(canvas, Offset(left, top));

    final fillPainter = TextPainter(
      text: fillSpan,
      textDirection: TextDirection.ltr,
      maxLines: maxLines,
      ellipsis: '...',
      textAlign: TextAlign.center,
    );
    fillPainter.layout(maxWidth: postImageWidth - _horizontalPadding * 2);
    fillPainter.paint(canvas, Offset(left, top));
    return top + fillPainter.height;
  }

  Future<double> _drawCenteredQr(Canvas canvas, String qrData, double top) async {
    final qrPainter = QrPainter(
      data: qrData,
      version: QrVersions.auto,
      gapless: true,
      color: Colors.black,
    );
    const qrSize = 420.0;
    final qrImage = await qrPainter.toImage(qrSize);
    final left = (postImageWidth - qrSize) / 2;

    final bgRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(left - 18, top - 18, qrSize + 36, qrSize + 36),
      const Radius.circular(6),
    );
    canvas.drawRRect(bgRect, Paint()..color = Colors.white);
    canvas.drawImage(qrImage, Offset(left, top), Paint());
    return top + qrSize;
  }

  double _drawSongRow(Canvas canvas, PostChartLine chart, double top) {
    final difficultyColor = _difficultyColor(chart.difficulty);
    final textSpan = TextSpan(
      children: [
        TextSpan(
          text: '${chart.playStyle} ',
          style: TextStyle(
            color: difficultyColor,
            fontSize: 43,
            fontWeight: FontWeight.w700,
          ),
        ),
        TextSpan(
          text: '${chart.level.toString().padLeft(2, '0')}  ',
          style: TextStyle(
            color: difficultyColor,
            fontSize: 43,
            fontWeight: FontWeight.w700,
          ),
        ),
        TextSpan(
          text: chart.title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 41,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
    final textPainter = TextPainter(
      text: textSpan,
      textDirection: TextDirection.ltr,
      maxLines: 2,
      ellipsis: '...',
    );
    final rowWidth = postImageWidth - _horizontalPadding * 2;
    textPainter.layout(maxWidth: rowWidth - 20);

    final rowHeight = math.max(84.0, textPainter.height + 22);
    final rowRect = Rect.fromLTWH(
      _horizontalPadding,
      top,
      rowWidth,
      rowHeight,
    );

    final fill = Paint()..color = const Color(0xFF204563).withValues(alpha: 0.92);
    final border = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..color = const Color(0xFF48E3E1);
    canvas.drawRect(rowRect, fill);
    canvas.drawRect(rowRect, border);

    final textTop = rowRect.top + (rowHeight - textPainter.height) / 2;
    textPainter.paint(canvas, Offset(rowRect.left + 10, textTop));
    return top + rowHeight;
  }

  void _drawBottomHashtag(Canvas canvas, Size size, String hashtag) {
    final strokeSpan = TextSpan(
      text: hashtag,
      style: TextStyle(
        fontSize: 58,
        fontWeight: FontWeight.w700,
        foreground: Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 6
          ..color = const Color(0xFF16264C),
      ),
    );
    final strokePainter = TextPainter(
      text: strokeSpan,
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '...',
      textAlign: TextAlign.center,
    );
    strokePainter.layout(maxWidth: postImageWidth - _horizontalPadding * 2);
    final fillPainter = TextPainter(
      text: TextSpan(
        text: hashtag,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 58,
          fontWeight: FontWeight.w700,
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '...',
      textAlign: TextAlign.center,
    );
    fillPainter.layout(maxWidth: postImageWidth - _horizontalPadding * 2);
    final left = (postImageWidth - fillPainter.width) / 2;
    final top = size.height - fillPainter.height - 120;
    strokePainter.paint(canvas, Offset(left, top));
    fillPainter.paint(canvas, Offset(left, top));
  }

  Color _difficultyColor(String difficulty) {
    switch (difficulty) {
      case 'BEGINNER':
        return const Color(0xFF79D100);
      case 'NORMAL':
        return const Color(0xFF20A8FF);
      case 'HYPER':
        return const Color(0xFFFF7800);
      case 'ANOTHER':
        return const Color(0xFFFF0000);
      case 'LEGGENDARIA':
        return const Color(0xFFCE00D6);
      default:
        return Colors.grey;
    }
  }
}
