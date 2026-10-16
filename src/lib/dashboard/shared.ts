export type DisplayProperty={title:string;building_name?:string;complex_name?:string;building_dong?:string;unit_number?:string};
export type Job={key:string;kind:string;id:string;assigned_staff_id:string;title:string;due_date:string|null;priority:number};
export type Contact={id:string;name:string;company_name:string;next_contact_at:string;assigned_staff_id:string;contract_id?:string|null;case_id?:string|null};
export type NewContract=DisplayProperty&{id:string;property_id:string;contract_date:string;status:string;contract_type:string|null;assigned_staff_id:string};
export type Recheck={id:string;title:string;assigned_staff_id:string;check_date:string;last_confirmed_at:string|null};
export type Workload={assigned_staff_id:string;count:number};
export type Core={metrics:Record<string,number>;contacts:Contact[];new_contracts:NewContract[];rechecks:Recheck[];priority:Job[];priority_count:number;workload:Workload[]};
export type Expiring=DisplayProperty&{id:string;property_id:string;lease_end_date:string;assigned_staff_id:string;customers:{id:string;name:string;deleted_at:string|null}[]};
export type CalendarEvent=DisplayProperty&{id:string;lease_end_date:string;assigned_staff_id:string;resolution_status:string|null};
export type ClosingEvent=DisplayProperty&{id:string;closing_date:string;assigned_staff_id:string};
export type Intention={kind:'relocate'|'renew';customer_id:string;name:string;company_name:string;contract_id:string;case_id:string|null;desired_region:string|null;assigned_staff_id:string};
export type Workflow={metrics:Record<string,number>;contacts:Contact[];intentions:Intention[];expiring:Expiring[];calendar:CalendarEvent[];closing_calendar?:ClosingEvent[];statistics:{renewed:number;completed:number;terminated:number};priority:Job[];priority_count:number;workload:Workload[]};
export function jobLink(job:Job){return job.kind==='property'?'/dashboard/properties/'+job.id:job.kind==='customer'?'/dashboard/customers/'+job.id:['expired','expiration'].includes(job.kind)?'/dashboard/expiration/'+job.id:'/dashboard#priority';}
export function mergeJobs(core:Core|null,workflow:Workflow|null){return [...(core?.priority??[]),...(workflow?.priority??[])].sort((a,b)=>a.priority-b.priority||(a.due_date??'9999-12-31').localeCompare(b.due_date??'9999-12-31')||a.key.localeCompare(b.key)).slice(0,20);}
