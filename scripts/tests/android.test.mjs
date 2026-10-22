import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assetLinksResponse } from '../../web/lib/android-association.mjs';
const fingerprint=Array.from({length:32},(_,n)=>(n+1).toString(16).padStart(2,'0')).join(':');
const entry=()=>({package_name:'ng.cybershop.app',sha256_cert_fingerprints:[fingerprint]});
const config=(entries=[entry()])=>({SITE_URL:'https://cybershop.ng',ANDROID_ASSETLINKS:JSON.stringify(entries)});
describe('Android Digital Asset Links fail-closed configuration',()=>{
  it('returns exact configured package/fingerprint with public JSON headers',async()=>{
    const response=assetLinksResponse(config());assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/application\/json/);
    assert.deepEqual(await response.json(),[{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:'ng.cybershop.app',sha256_cert_fingerprints:[fingerprint.toUpperCase()]}}]);
  });
  for (const env of [{}, {SITE_URL:'https://cybershop.ng',ANDROID_ASSETLINKS:'bad'},config([]),config([{...entry(),package_name:'not a package'}]),config([{...entry(),sha256_cert_fingerprints:['00:'.repeat(31)+'00']}]),config([{...entry(),sha256_cert_fingerprints:['fake']}]),config([entry(),entry()]),{...config(),SITE_URL:'http://cybershop.ng'}]) {
    it('refuses missing/malformed/duplicate association '+JSON.stringify(env).slice(0,75),()=>{
      const result=assetLinksResponse(env);assert.equal(result.status,503);assert.equal(result.headers.get('cache-control'),'no-store');
    });
  }
  it('never publishes debug certificates on the production domain',()=>{
    const env={...config([{...entry(),package_name:'ng.cybershop.app.debug'}]),ANDROID_ASSOCIATION_ENV:'staging'};
    assert.equal(assetLinksResponse(env).status,503);
    assert.equal(assetLinksResponse({...env,SITE_URL:'https://owned-stage.cybershop.ng'}).status,200);
    assert.equal(assetLinksResponse({...env,SITE_URL:'https://owned-stage.cybershop.ng',ANDROID_ASSOCIATION_ENV:'production'}).status,503);
  });
});
describe('Android source/build safeguards (not compilation/device proof)',()=>{
  const read=(path)=>readFileSync(new URL('../../android/'+path,import.meta.url),'utf8');
  it('exposes one guarded launch activity and denies cleartext/backup',()=>{
    const manifest=read('app/src/main/AndroidManifest.xml');assert.equal((manifest.match(/android:exported="true"/g)||[]).length,1);
    assert.match(manifest,/usesCleartextTraffic="false"/);assert.match(manifest,/allowBackup="false"/);assert.doesNotMatch(manifest,/WebViewFallbackActivity|REQUEST_INSTALL_PACKAGES|READ_EXTERNAL_STORAGE/);
  });
  it('strips incoming extras and confines navigation without a native JS bridge',()=>{
    const source=read('app/src/main/java/ng/cybershop/app/LauncherActivity.java');assert.match(source,/new Intent\(Intent.ACTION_VIEW/);assert.match(source,/LinkPolicy.isAllowed/);assert.doesNotMatch(source,/addJavascriptInterface/);
  });
  it('pins distribution integrity and uses explicit signed-release gate',()=>{
    assert.match(read('gradle/wrapper/gradle-wrapper.properties'),/distributionSha256Sum=[a-f0-9]{64}/);
    assert.match(read('app/build.gradle'),/cybershopReleaseApproved/);assert.match(read('app/build.gradle'),/applicationIdSuffix '\.debug'/);
  });
});
