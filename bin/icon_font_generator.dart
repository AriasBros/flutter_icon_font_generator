import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'package:archive/archive_io.dart';
import 'package:yaml/yaml.dart';

Future<void> main(List<String> arguments) async {
  final workingPath = await _workingPath;
  final pwd = Directory.current;
  final projectPath = pwd.path;
  final file = File('$projectPath/icons.yaml');
  final Map config;

  if (file.existsSync()) {
    final data = file.readAsStringSync();
    config = loadYaml(data);
  } else {
    config = {}; // TODO - Put defaults here.
  }

  final String? zipUrl = config['input-remote-zip'];

  if (zipUrl != null) {
    final String outputPath = '$projectPath/${config['input-icons-dir']}';
    final Directory outputDir = Directory(outputPath);
    final String zipPath = '$outputPath/temp.zip';

    if (outputDir.existsSync()) {
      await outputDir.delete(recursive: true);
    }

    await outputDir.create(recursive: true);

    await _downloadZip(zipUrl, zipPath);
    await _extractZip(zipPath, outputPath);
    await _deleteZip(zipPath);
  }

  await _runNpmInstall(workingPath);
  await _generateFont(workingPath, projectPath, config);
}

Future<String> get _workingPath async {
  final packageUri = Uri.parse('package:icon_font_generator/assets');
  final workingDirectory = await Isolate.resolvePackageUri(packageUri);

  return workingDirectory!.path;
}

Future<void> _downloadZip(String url, String path) async {
  stdout.write('Downloading icons...');
  final request = await HttpClient().getUrl(Uri.parse(url));
  final response = await request.close();

  await response.pipe(File(path).openWrite());
  print(' Done!');
}

Future<void> _extractZip(String path, String outputPath) async {
  stdout.write('Extracting icons...');
  final inputStream = InputFileStream(path);
  final archive = ZipDecoder().decodeBuffer(inputStream);

  await Future.forEach<ArchiveFile>(archive.files, (file) async {
    if (file.name != '/') {
      final outputStream = OutputFileStream('$outputPath/${file.name}');
      file.writeContent(outputStream);
      await outputStream.close();
    }
  });
  print(' Done!');
}

Future<void> _deleteZip(String path) async {
  stdout.write('Deleting temp zip file...');
  await File(path).delete();
  print(' Done!');
}

Future<void> _runNpmInstall(String path) async {
  stdout.write('Running npm install...');
  final result = await Process.run('npm', ['install'], workingDirectory: path);
  print(' Done with result ${result.exitCode}');
}

Future<void> _generateFont(String path, String projectPath, Map config) async {
  final args = ['main.js', '--project-path', projectPath];

  for (MapEntry entry in config.entries) {
    if (entry.value != null) {
      args.add('--${entry.key}');

      if (entry.value is Map || entry.value is List) {
        args.add(json.encode(entry.value));
      } else {
        args.add(entry.value);
      }
    }
  }

  print('Generating icons font...');
  final result = await Process.run('node', args, workingDirectory: path);

  if (result.exitCode == 0) {
    print(result.stdout);
    print('Icons font generated!');
  } else {
    print(result.stderr);
    print('Something was wrong.');
  }
}
