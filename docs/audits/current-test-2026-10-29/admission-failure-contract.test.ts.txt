import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/services/payment-workflow-client',()=>({paymentWorkflowClient:{createAdmission:vi.fn().mockRejectedValue(new Error('Synthetic server rejection: admission not saved'))}}));
import {store} from '@/lib/services/data-store';
import {createAdmissionWorkflow} from '@/lib/services/admission-service';
afterEach(()=>vi.unstubAllGlobals());
it('does not create a local successful admission after the authoritative server rejects it',async()=>{
 const actor=store.users.find(u=>u.role==='counsellor'&&u.is_active)!;
 const course=store.courses[0];const initial=store.admissions.length;
 vi.stubGlobal('window',{});
 let rejected=false;try{await createAdmissionWorkflow({student_name:'Synthetic rejected admission',phone:'9990001234',email:'reject@example.invalid',dob:'2000-01-01',gender:'Other',address:'Synthetic',city:'Synthetic',education:'Graduate',experience_years:0,current_employment_status:'Student',course_id:course.id,admission_date:'2026-10-29',course_fee:course.price,discount:0,payment_plan:'Full Payment',counsellor_id:actor.id},actor.id);}catch{rejected=true;}
 expect({rejected,localAdmissionsAdded:store.admissions.length-initial}).toEqual({rejected:true,localAdmissionsAdded:0});
});
