package ng.cybershop.app;
import org.junit.Test;
import static org.junit.Assert.*;
public final class LinkPolicyTest {
    private static final String ORIGIN="https://cybershop.ng";
    @Test public void allowsExactOriginAndUsefulDeepLinks() {
        for(String path:new String[]{"/","/business/test/product/item","/cart","/account/security","/reset-password?token=synthetic","/payment/status?reference=CS-TEST"})
            assertTrue(path,LinkPolicy.isAllowed(ORIGIN+path,ORIGIN));
        assertTrue(LinkPolicy.isAllowed("https://CYBERSHOP.NG:443/listings",ORIGIN));
    }
    @Test public void rejectsUntrustedOriginsSchemesAndIntentAbuse() {
        for(String value:new String[]{"http://cybershop.ng/","https://cybershop.ng.evil.test/","https://evil.test/cybershop.ng","https://user@cybershop.ng/","https://cybershop.ng:444/","javascript:alert(1)","intent://cybershop.ng/","file:///etc/passwd","data:text/html,test","//cybershop.ng/path","https://cybershop.ng/#intent","https://cybershop.ng\\@evil.test/","https://cybershop.ng/%ZZ"})
            assertFalse(value,LinkPolicy.isAllowed(value,ORIGIN));
        assertFalse(LinkPolicy.isAllowed(null,ORIGIN));
    }
    @Test public void separatesConfiguredStagingOrigin() {
        assertFalse(LinkPolicy.isAllowed(ORIGIN+"/","https://stage.cybershop.ng"));
        assertTrue(LinkPolicy.isAllowed("https://stage.cybershop.ng/login","https://stage.cybershop.ng"));
    }
}
