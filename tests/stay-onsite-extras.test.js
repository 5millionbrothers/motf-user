const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const dateFunctions=source.slice(source.indexOf('function addDays('),source.indexOf('function normalizeStaySearchDates('));
const prices=source.slice(source.indexOf('function dateInSeasonRanges('),source.indexOf('function checkoutPreviewContextKey('));
const amount=source.slice(source.indexOf('function bookingAmount('),source.indexOf('function renderBooking('));
const rateConstants=source.slice(source.indexOf('const MOZART_STAY_ID'),source.indexOf('const DAESUNG_MARKET_INTRO'));
function calculate(people,nightly=600000){
 const room={price:nightly,basePeople:10,maxPeople:40,extraPersonFee:20000};
 const inputs={'#stayCheckInDate':{value:'2026-12-01'},'#stayCheckOutDate':{value:'2026-12-03'},'#bookingPeople':{value:people}};
 const context=vm.createContext({window:{},state:{selectedRoom:room,selectedStay:{extraFees:[{amount:120000,category:'optional'}]}},qs:selector=>inputs[selector],selectedStayPeople:()=>people,roomCapacityMax:()=>40});
 vm.runInContext(rateConstants+dateFunctions+prices+amount,context);
 return JSON.parse(JSON.stringify(vm.runInContext('bookingAmount()',context)));
}
test('additional guests never increase the platform checkout amount',()=>{
 const normal=calculate(10),group=calculate(32);
 assert.equal(group.extraPersonTotal,440000);assert.equal(group.extraPeople,22);
 assert.equal(group.nights,2);assert.equal(group.total,1200000);assert.equal(group.total,normal.total);
});
test('Mozart A/B slots honor Saturday-only rates and reject any unavailable night in a range',()=>{
 const context=vm.createContext({window:{MotfStayBookingWindow:require('../stay-booking-window')}});
 vm.runInContext(rateConstants+prices,context);
 const result=vm.runInContext(`(() => {
   const mozart={id:MOZART_STAY_ID};
   const weekday={id:[...MOZART_SATURDAY_RATE_ROOMS][0],price:298000,seasonalPrices:{offseasonWeekday:298000,offseasonWeekend:999999}};
   const saturday={id:[...MOZART_SATURDAY_RATE_ROOMS][1],price:999999,seasonalPrices:{offseasonWeekday:999999,offseasonWeekend:500000}};
   const chalet={id:"chalet",price:490000,seasonalPrices:{offseasonWeekday:490000,offseasonWeekend:590000}};
   return [roomPriceForDate(mozart,weekday,"2026-11-20"),roomPriceForDate(mozart,saturday,"2026-11-21"),
     roomPriceForDate(mozart,weekday,"2026-11-22"),roomPriceForDate(mozart,chalet,"2026-11-20"),
     isRoomRateBlocked(mozart,weekday,"2026-11-20","2026-11-22"),isRoomRateBlocked(mozart,saturday,"2026-11-20","2026-11-21"),
     isRoomRateBlocked(mozart,saturday,"2026-11-21","2026-11-22"),isRoomRateBlocked({id:"other"},saturday,"2026-11-20","2026-11-21")];
 })()`,context);
 assert.deepEqual(Array.from(result),[298000,500000,298000,590000,true,true,false,false]);
});
test('onsite extras do not turn a below-limit room payment into an above-limit payment',()=>{
 const group=calculate(40,4900000);
 assert.equal(group.roomFee,9800000);assert.equal(group.extraPersonTotal,600000);assert.equal(group.total,9800000);
});
test('booking and legal copy explicitly say onsite confirmation and onsite payment, without the old exception',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 assert.match(html,/추가금은 현장에서 확인 후 숙소 현장에서 직접 결제/);
 assert.match(html,/추가금을 사이트에서 별도로 결제하도록 요청하지 않습니다/);
 assert.doesNotMatch(html,/사전에 달리 표시하지 않는 한 숙박시설에 직접 지급/);
 assert.doesNotMatch(source,/이용 후 별도 결제/);
});
test('prepared stay payment keeps the server amount and adds a separate onsite-payment notice',()=>{
 const prepared=source.slice(source.indexOf('window.motfStartPreparedPayment ='),source.indexOf('window.motfApplyMyTransactions ='));
 const context=vm.createContext({window:{},state:{selectedStay:{name:'숙소'},selectedRoom:{name:'객실'}},MAX_SINGLE_PAYMENT_AMOUNT:10000000,PAYMENT_LIMIT_MESSAGE:'limit',routeParents:{},savePendingPayment(){},navigate(){}});
 vm.runInContext(prepared,context);
 context.window.motfStartPreparedPayment({kind:'stay',amount:580000,original_amount:600000,points_used:20000,order_id:'test',order_name:'숙소 객실'},{customer_name:'이용자',guest_count:32,event_date:'2026-12-01',check_out_date:'2026-12-02'});
 const payment=JSON.parse(JSON.stringify(context.state.pendingPayment));
 assert.equal(payment.amount,580000);assert.equal(payment.originalAmount,600000);
 assert.deepEqual(payment.lines.find(([label])=>label==='추가금'),['추가금','숙소 현장 결제']);
 assert.deepEqual(payment.lines.filter(([,value])=>typeof value==='number'),[['객실 기본금',600000],['포인트 사용',-20000]]);
});
