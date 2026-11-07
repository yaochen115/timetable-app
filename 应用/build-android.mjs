import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.dirname(root);
const sdk = process.env.LINMU_ANDROID_SDK || path.resolve(project, '../android-sdk');
const jdk = process.env.LINMU_JAVA_HOME || 'D:/WORK/java26';
const tools = path.join(sdk, 'build-tools/36.0.0');
const platform = path.join(sdk, 'platforms/android-36/android.jar');
const runtime = path.join(root, '.runtime');
const build = path.join(root, '.build');
const signing = path.join(root, '.signing');
const output = path.join(project, '安装包');
const manifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
const version = manifest.match(/android:versionName="([\d.]+)"/)[1];
const dirs = ['classes', 'dex', 'generated', 'tmp'];
for (const dir of [build, runtime, signing, output, ...dirs.map((name) => path.join(build, name))]) fs.mkdirSync(dir, { recursive: true });
const javaOptions = [`-Duser.home=${runtime}`, `-Djava.io.tmpdir=${path.join(build, 'tmp')}`];
const env = { ...process.env, TEMP: path.join(build, 'tmp'), TMP: path.join(build, 'tmp'), ANDROID_USER_HOME: path.join(runtime, 'android-home'), ANDROID_SDK_HOME: runtime };
const log = [];
function run(label, executable, args) {
  console.log(label);
  const result = spawnSync(executable, args, { cwd: root, env, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  log.push({ label, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message });
  fs.writeFileSync(path.join(build, 'build-log.json'), JSON.stringify(log, null, 2));
  if (result.error || result.status !== 0) throw new Error(`${label}\n${result.error?.message || ''}\n${result.stderr || result.stdout}`);
  return result.stdout;
}
const java = path.join(jdk, 'bin/java.exe');
const unsigned = path.join(build, 'unsigned.apk');
const aligned = path.join(build, 'aligned.apk');
const signed = path.join(build, 'signed.apk');
const apkName = `林木-Android-${version}.apk`;
const apk = path.join(output, apkName);
const passwordFile = path.join(signing, 'password.txt');
const keystore = path.join(signing, 'linmu.p12');
run('检查应用脚本', process.execPath, ['--check', path.join(root, 'web/app.js')]);
if (!fs.existsSync(keystore)) {
  if (!fs.existsSync(passwordFile)) fs.writeFileSync(passwordFile, randomBytes(24).toString('base64url'));
  run('生成项目专用签名密钥', path.join(jdk, 'bin/keytool.exe'), [
    ...javaOptions.map((value) => `-J${value}`), '-genkeypair', '-storetype', 'PKCS12', '-keystore', keystore,
    '-storepass:file', passwordFile, '-keypass:file', passwordFile, '-alias', 'linmu',
    '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Linmu, O=Linmu', '-noprompt',
  ]);
}
// 部分 Windows SDK 原生命令不支持中文参数，输入输出使用项目内的 ASCII 相对路径。
if (!fs.existsSync(path.join(runtime, 'android.jar'))) fs.copyFileSync(platform, path.join(runtime, 'android.jar'));
run('编译安卓资源', path.join(tools, 'aapt2.exe'), ['compile', '--dir', 'android/res', '-o', '.build/resources.zip']);
const assets = path.join(build, 'apk-assets');
fs.mkdirSync(assets, { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js', 'icon.svg']) fs.copyFileSync(path.join(root, 'web', name), path.join(assets, name));
run('打包清单与离线界面', path.join(tools, 'aapt2.exe'), [
  'link', '-o', '.build/unsigned.apk', '--manifest', 'android/AndroidManifest.xml',
  '-I', '.runtime/android.jar', '.build/resources.zip', '-A', '.build/apk-assets', '--java', '.build/generated',
]);
run('编译安卓容器', path.join(jdk, 'bin/javac.exe'), [
  ...javaOptions.map((value) => `-J${value}`), '--release', '8', '-encoding', 'UTF-8', '-classpath', platform,
  '-d', path.join(build, 'classes'), path.join(root, 'android/src/com/linmu/timetable/MainActivity.java'),
]);
run('归档安卓类', path.join(jdk, 'bin/jar.exe'), [...javaOptions.map((value) => `-J${value}`), '--create', '--file', path.join(build, 'classes.jar'), '-C', path.join(build, 'classes'), '.']);
run('生成 DEX', java, [...javaOptions, '-cp', path.join(tools, 'lib/d8.jar'), 'com.android.tools.r8.D8', '--lib', platform, '--min-api', '26', '--output', path.join(build, 'dex'), path.join(build, 'classes.jar')]);
run('合入 DEX', path.join(jdk, 'bin/jar.exe'), [...javaOptions.map((value) => `-J${value}`), '--update', '--file', unsigned, '-C', path.join(build, 'dex'), 'classes.dex']);
run('对齐安装包', path.join(tools, 'zipalign.exe'), ['-f', '-p', '4', '.build/unsigned.apk', '.build/aligned.apk']);
run('签名安装包', java, [...javaOptions, '-jar', path.join(tools, 'lib/apksigner.jar'), 'sign', '--ks', keystore, '--ks-key-alias', 'linmu', '--ks-pass', `file:${passwordFile}`, '--out', signed, aligned]);
const signature = run('验证安装包签名', java, [...javaOptions, '-jar', path.join(tools, 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', signed]);
run('验证安装包对齐', path.join(tools, 'zipalign.exe'), ['-c', '-p', '4', '.build/signed.apk']);
const badging = run('验证应用清单', path.join(tools, 'aapt.exe'), ['dump', 'badging', '.build/signed.apk']);
const permissions = run('验证应用权限', path.join(tools, 'aapt.exe'), ['dump', 'permissions', '.build/signed.apk']);
if (permissions.includes('android.permission.INTERNET')) throw new Error('Offline app unexpectedly requests INTERNET');
const bytes = fs.readFileSync(signed);
const assetReport = verifyPackagedAssets(bytes);
fs.copyFileSync(signed, apk);
const report = { version, package: 'com.linmu.timetable', minAndroid: 8, targetSdk: 35, apk, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), signature, badging, permissions, builtAt: new Date().toISOString(), assetsSha256: assetReport.hashes, verifiedApkEntries: assetReport.entries };
fs.writeFileSync(path.join(output, '构建校验.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(output, 'SHA256.txt'), `${report.sha256}  ${apkName}\n`);
console.log(`完成 ${apk} (${bytes.length} bytes)`);

function verifyPackagedAssets(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('APK central directory missing');
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid APK central directory');
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name.includes('\\')) throw new Error(`Android cannot use Windows ZIP path: ${name}`);
    entries.set(name, { method: bytes.readUInt16LE(offset + 10), size: bytes.readUInt32LE(offset + 20), localOffset: bytes.readUInt32LE(offset + 42) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const hashes = {};
  for (const name of ['index.html', 'styles.css', 'app.js', 'icon.svg']) {
    const entry = entries.get(`assets/${name}`);
    if (!entry) throw new Error(`Native AssetManager path is missing: ${name}`);
    const local = entry.localOffset;
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error(`Invalid ZIP entry: ${name}`);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + entry.size);
    const content = entry.method === 8 ? inflateRawSync(compressed) : compressed;
    if (![0, 8].includes(entry.method) || !content.equals(fs.readFileSync(path.join(root, 'web', name)))) throw new Error(`Packaged content differs from source: ${name}`);
    hashes[name] = createHash('sha256').update(content).digest('hex');
  }
  console.log('验证 APK 内资源路径与实际内容');
  return { hashes, entries: [...entries.keys()].filter((name) => name.startsWith('assets/')) };
}
