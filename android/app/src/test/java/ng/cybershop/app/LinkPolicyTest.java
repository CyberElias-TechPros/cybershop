package ng.cybershop.app;
import org.junit.Test;
import static org.junit.Assert.*;
public final class LinkPolicyTest {
    private static final String ORIGIN="https://shop.freegameplay.site";
    @Test public void allowsExactOriginAndUsefulDeepLinks() {
        for(String path:new String[]{"/","/business/test/product/item","/cart","/account/security","/reset-password?token=synthetic","/payment/status?reference=CS-TEST"})
            assertTrue(path,LinkPolicy.isAllowed(ORIGIN+path,ORIGIN));
        assertTrue(LinkPolicy.isAllowed("https://SHOP.FREEGAMEPLAY.SITE:443/listings",ORIGIN));
    }
    @Test public void rejectsUntrustedOriginsSchemesAndIntentAbuse() {
        for(String value:new String[]{"http://shop.freegameplay.site/","https://shop.freegameplay.site.evil.test/","https://evil.test/shop.freegameplay.site","https://user@shop.freegameplay.site/","https://shop.freegameplay.site:444/","javascript:alert(1)","intent://shop.freegameplay.site/","file:///etc/passwd","data:text/html,test","//shop.freegameplay.site/path","https://shop.freegameplay.site/#intent","https://shop.freegameplay.site\\@evil.test/","https://shop.freegameplay.site/%ZZ"})
            assertFalse(value,LinkPolicy.isAllowed(value,ORIGIN));
        assertFalse(LinkPolicy.isAllowed(null,ORIGIN));
    }
    @Test public void separatesConfiguredStagingOrigin() {
        assertFalse(LinkPolicy.isAllowed(ORIGIN+"/","https://stage.shop.freegameplay.site"));
        assertTrue(LinkPolicy.isAllowed("https://stage.shop.freegameplay.site/login","https://stage.shop.freegameplay.site"));
    }
}
