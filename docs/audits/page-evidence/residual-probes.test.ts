// Authentication reproductions now assert fail-closed behavior; quiz probe remains unchanged.
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),signIn:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:()=>({auth:{getUser:mocks.getUser}})}));
vi.mock('@/lib/supabase/db',()=>({isLiveSupabaseEnabled:()=>true,getDb:()=>({auth:{signInWithPassword:mocks.signIn}})}));
import { store } from '@/lib/services/data-store';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { verifyUserCredentials } from '@/lib/auth/credentials';
import { generateAuthCookieSignature,AUTH_COOKIE_NAME,AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { recordQuizAttempt } from '@/lib/services/academics-service';
beforeEach(()=>{
 vi.spyOn(store,'persist').mockImplementation(()=>{});
 vi.spyOn(store,'persistSync').mockReturnValue(true);
 mocks.getUser.mockResolvedValue({data:{user:null},error:new Error('Synthetic rejected live session')});
 mocks.signIn.mockResolvedValue({data:{user:null},error:new Error('Synthetic rejected live password')});
 store.users=[{id:'audit-admin',email:'admin@next-generpsolutions.com',role:'admin',tenant_id:'audit',is_active:true,full_name:'Synthetic audit admin',created_at:'2026-10-17',updated_at:'2026-10-17'}];
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it('G02 regression: known local actor is rejected after live session rejection',async()=>{
 const value=encodeURIComponent(JSON.stringify({id:'audit-admin'}));const sig=await generateAuthCookieSignature(value);
 await expect(authenticatePaymentRequest(new NextRequest('http://localhost/api/fees/payments',{headers:{cookie:`${AUTH_COOKIE_NAME}=${value}; ${AUTH_SIG_COOKIE_NAME}=${sig}`}}))).rejects.toThrow('valid Supabase session');
 expect(mocks.getUser).toHaveBeenCalled();
});
it('G11 residual: production live rejection falls through to named demo password',async()=>{
 vi.stubEnv('NODE_ENV','production');
 const result=await verifyUserCredentials('admin@next-generpsolutions.com','AdminPass#2026');
 expect(mocks.signIn).toHaveBeenCalled();expect(result.success).toBe(false);
});
it('G14 residual: repeated successful quiz increases progress twice',()=>{
 store.students=[{id:'audit-student',course_progress:0} as any];store.quizAttempts=[];
 const quiz={id:'audit-quiz',course_id:'audit-course'} as any;
 const evaluation={score:1,total_points:1,percentage:100,passed:true,answers:[]} as any;
 recordQuizAttempt(quiz,'audit-student',evaluation,'2026-10-17');
 recordQuizAttempt(quiz,'audit-student',evaluation,'2026-10-17');
 expect(store.students[0].course_progress).toBe(30);
});
