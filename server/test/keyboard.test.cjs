const {test} = require('node:test');
const assert = require('node:assert/strict');
const {handle} = require('../../web/js/keyboard.js');
function setup(search = false) {
  const calls = [];
  const controller = {state:{screen:'songs',search:{open:search}}, typeQ: x => calls.push(x), closeSearch: () => calls.push('close')};
  return {controller,calls};
}
const key = (value, extra = {}) => ({key:value, preventDefault(){this.prevented=true;}, ...extra});
test('búsqueda física escribe letras de atajos, espacio y borra caracteres', () => {
  const {controller,calls} = setup(true);
  for (const value of ['p','q','x','y',' ','ñ','Backspace']) assert.equal(handle(controller,key(value)),true);
  assert.deepEqual(calls,['p','q','x','y',' ','ñ',null]);
  handle(controller,key('Enter')); assert.equal(calls.at(-1),'close');
});
test('flechas repetidas navegan pero Enter repetido no atraviesa pantallas', () => {
  const {controller} = setup();
  assert.equal(handle(controller,key('ArrowDown',{repeat:true})),false);
  assert.equal(handle(controller,key('Enter',{repeat:true})),true);
  assert.equal(handle(controller,key('Enter')),false);
});
test('no captura atajos del sistema, composición ni campos de texto', () => {
  const {controller,calls} = setup(true);
  for (const extra of [{metaKey:true},{ctrlKey:true},{isComposing:true},{target:{closest:()=>true}}]) {
    const e=key('p',extra); assert.equal(handle(controller,e),true); assert.equal(e.prevented,undefined);
  }
  assert.deepEqual(calls,[]);
});
