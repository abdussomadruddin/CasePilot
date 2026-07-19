update public.cases
set status = case status
  when 'hint_submitted'::public.case_status then 'pending_allocation'::public.case_status
  when 'booking_form_received'::public.case_status then 'waiting_ehakmilik'::public.case_status
  when 'registration_needed'::public.case_status then 'registered'::public.case_status
  when 'roadtax_grant_process'::public.case_status then 'grant_roadtax_collected'::public.case_status
  else status
end
where status::text in (
  'hint_submitted',
  'booking_form_received',
  'registration_needed',
  'roadtax_grant_process'
);

update public.case_activities
set status = case status
  when 'hint_submitted'::public.case_status then 'pending_allocation'::public.case_status
  when 'booking_form_received'::public.case_status then 'waiting_ehakmilik'::public.case_status
  when 'registration_needed'::public.case_status then 'registered'::public.case_status
  when 'roadtax_grant_process'::public.case_status then 'grant_roadtax_collected'::public.case_status
  else status
end
where status::text in (
  'hint_submitted',
  'booking_form_received',
  'registration_needed',
  'roadtax_grant_process'
);

update public.case_notifications
set status = case status
  when 'hint_submitted'::public.case_status then 'pending_allocation'::public.case_status
  when 'booking_form_received'::public.case_status then 'waiting_ehakmilik'::public.case_status
  when 'registration_needed'::public.case_status then 'registered'::public.case_status
  when 'roadtax_grant_process'::public.case_status then 'grant_roadtax_collected'::public.case_status
  else status
end
where status::text in (
  'hint_submitted',
  'booking_form_received',
  'registration_needed',
  'roadtax_grant_process'
);

update public.case_activities
set message = 'Status changed to ' || case status
  when 'documents_collected'::public.case_status then 'Document collected'
  when 'more_documents_needed'::public.case_status then 'More document needed'
  when 'submission'::public.case_status then 'Submission'
  when 'rejected'::public.case_status then 'Rejected'
  when 'lou_received'::public.case_status then 'LOU received'
  when 'pending_sign_agreement'::public.case_status then 'Pending sign agreement'
  when 'pending_allocation'::public.case_status then 'Pending allocation'
  when 'waiting_ehakmilik'::public.case_status then 'Waiting ehakmilik'
  when 'registered'::public.case_status then 'Registered'
  when 'grant_roadtax_collected'::public.case_status then 'Grant & roadtax collected'
  when 'prepare_delivery'::public.case_status then 'Prepare delivery'
  when 'car_delivery'::public.case_status then 'Delivered'
  when 'cancelled'::public.case_status then 'Cancelled'
  else status::text
end || '.'
where type::text = 'status'
  and status is not null
  and lower(message) like 'status changed to %';

update public.case_notifications
set reason = case
  when reason like 'New case created with status %.' then
    'New case created with status ' || case status
      when 'documents_collected'::public.case_status then 'Document collected'
      when 'more_documents_needed'::public.case_status then 'More document needed'
      when 'submission'::public.case_status then 'Submission'
      when 'rejected'::public.case_status then 'Rejected'
      when 'lou_received'::public.case_status then 'LOU received'
      when 'pending_sign_agreement'::public.case_status then 'Pending sign agreement'
      when 'pending_allocation'::public.case_status then 'Pending allocation'
      when 'waiting_ehakmilik'::public.case_status then 'Waiting ehakmilik'
      when 'registered'::public.case_status then 'Registered'
      when 'grant_roadtax_collected'::public.case_status then 'Grant & roadtax collected'
      when 'prepare_delivery'::public.case_status then 'Prepare delivery'
      when 'car_delivery'::public.case_status then 'Delivered'
      when 'cancelled'::public.case_status then 'Cancelled'
      else status::text
    end || '.'
  when reason like 'Case status changed to %.' then
    'Case status changed to ' || case status
      when 'documents_collected'::public.case_status then 'Document collected'
      when 'more_documents_needed'::public.case_status then 'More document needed'
      when 'submission'::public.case_status then 'Submission'
      when 'rejected'::public.case_status then 'Rejected'
      when 'lou_received'::public.case_status then 'LOU received'
      when 'pending_sign_agreement'::public.case_status then 'Pending sign agreement'
      when 'pending_allocation'::public.case_status then 'Pending allocation'
      when 'waiting_ehakmilik'::public.case_status then 'Waiting ehakmilik'
      when 'registered'::public.case_status then 'Registered'
      when 'grant_roadtax_collected'::public.case_status then 'Grant & roadtax collected'
      when 'prepare_delivery'::public.case_status then 'Prepare delivery'
      when 'car_delivery'::public.case_status then 'Delivered'
      when 'cancelled'::public.case_status then 'Cancelled'
      else status::text
    end || '.'
  else reason
end
where reason like 'New case created with status %.'
   or reason like 'Case status changed to %.';
