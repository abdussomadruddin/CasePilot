import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWhatsAppUsername, leadWhatsAppUrl, hasLeadWhatsApp } from '../src/lib/whatsapp-contact.ts';
import { formatLeadCopy } from '../src/lib/lead-copy.ts';

test('normalizes manual usernames and exact wa.me links without storing keys', () => {
  for (const input of ['@Irfan_faris', 'irfan_faris', ' https://wa.me/Irfan_faris ', 'wa.me/irfan_faris/']) assert.equal(normalizeWhatsAppUsername(input), 'irfan_faris');
  assert.equal(normalizeWhatsAppUsername(''), '');
  for (const input of ['ab','123456','@bad name','a..b','https://evil.test/irfan','https://wa.me/irfan?key=secret','http://wa.me/irfan','https://wa.me/irfan/extra','.irfan','a'.repeat(36),'https://wa.me/irfan#key']) assert.throws(() => normalizeWhatsAppUsername(input));
});
test('username only links, phone priority and invalid destinations', () => {
  assert.equal(leadWhatsAppUrl({customerPhone:'',whatsappUsername:'@irfan_faris'}),'https://wa.me/irfan_faris');
  assert.equal(leadWhatsAppUrl({customerPhone:'0171234567',whatsappUsername:'irfan_faris'}),'https://wa.me/60171234567');
  assert.equal(hasLeadWhatsApp({customerPhone:'',whatsappUsername:'bad name'}),false);
  assert.equal(hasLeadWhatsApp({customerPhone:'',whatsappUsername:''}),false);
  assert.equal(hasLeadWhatsApp({customerPhone:'0171234567'}),true);
});
test('copy includes username once and preserves phone-only behavior', () => {
  const lead={source:'manual_upload',sourceNote:'',customerName:'Irfan',customerPhone:'',email:'',carBrand:'',carModel:'',status:'new',whatsappUsername:'irfan_faris'};
  assert.match(formatLeadCopy(lead,false),/WhatsApp: @irfan_faris/);
  assert.equal(formatLeadCopy({...lead,sourceNote:'@irfan_faris'}).match(/irfan_faris/g).length,1);
});
