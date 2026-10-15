'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Plus,
  PlayCircle,
  FileText,
  HelpCircle,
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Clock,
  CheckCircle,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  ShieldAlert,
  AlertTriangle,
  MoveUp,
  MoveDown,
  Globe,
  Eye,
  Download,
  Upload,
  Send,
  FileCheck,
  Paperclip,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Course, CourseModule, Lesson, LessonType } from '@/types';
import { useAuth } from '@/components/providers/auth-provider';
import {
  createCourse,
  updateCourse,
  deleteCourse,
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
} from '@/lib/services/academics-service';
import { canAccessCourse } from '@/lib/auth/rbac';
import { formatINR } from '@/lib/utils/formatters';

export default function CoursesPage() {
  const { user, role, hasPermission } = useAuth();
  const [courses, setCourses] = React.useState<Course[]>(store.courses);
  const [selectedCourseId, setSelectedCourseId] = React.useState<string | null>(null);

  // RBAC Course Scoping: Trainers only see assigned courses; Admins see all.
  const allowedCourses = React.useMemo(() => {
    if (role === 'admin' || role === 'super_admin') {
      return courses;
    }
    return courses.filter((c) => canAccessCourse(user, c.id));
  }, [courses, user, role]);

  // Selected Course Resolution (Defensive: never crashes if courses array is empty)
  const selectedCourse = React.useMemo(() => {
    if (selectedCourseId) {
      const found = allowedCourses.find((c) => c.id === selectedCourseId);
      if (found) return found;
    }
    return allowedCourses[0] || null;
  }, [allowedCourses, selectedCourseId]);

  const [modules, setModules] = React.useState<CourseModule[]>([]);
  const [lessons, setLessons] = React.useState<Lesson[]>([]);

  // RBAC Permissions
  const canPublishCourse = role === 'admin' || role === 'super_admin' || hasPermission('courses:publish');
  const canCreateCourse = role === 'admin' || role === 'super_admin';
  const canEditCourse =
    role === 'admin' ||
    role === 'super_admin' ||
    Boolean(role === 'trainer' && selectedCourse && canAccessCourse(user, selectedCourse.id));
  const canDeleteCourse = role === 'admin' || role === 'super_admin';
  const canManageCurriculum = Boolean(
    selectedCourse &&
      (role === 'admin' ||
        role === 'super_admin' ||
        (role === 'trainer' && canAccessCourse(user, selectedCourse.id)))
  );

  // Modals state
  const [isAddCourseModal, setIsAddCourseModal] = React.useState(false);
  const [isEditCourseModal, setIsEditCourseModal] = React.useState(false);
  const [isDeleteCourseModal, setIsDeleteCourseModal] = React.useState(false);

  const [isAddModuleModal, setIsAddModuleModal] = React.useState(false);
  const [isEditModuleModal, setIsEditModuleModal] = React.useState(false);
  const [isDeleteModuleModal, setIsDeleteModuleModal] = React.useState(false);
  const [editingModule, setEditingModule] = React.useState<CourseModule | null>(null);

  const [isAddLessonModal, setIsAddLessonModal] = React.useState(false);
  const [isEditLessonModal, setIsEditLessonModal] = React.useState(false);
  const [isDeleteLessonModal, setIsDeleteLessonModal] = React.useState(false);
  const [activeModuleId, setActiveModuleId] = React.useState<string | null>(null);
  const [editingLesson, setEditingLesson] = React.useState<Lesson | null>(null);

  // Lesson Preview Modal state
  const [previewLesson, setPreviewLesson] = React.useState<Lesson | null>(null);
  const [isPreviewLessonModal, setIsPreviewLessonModal] = React.useState(false);

  const openPreviewLessonModal = (les: Lesson) => {
    setPreviewLesson(les);
    setIsPreviewLessonModal(true);
  };

  // New Course state
  const [courseName, setCourseName] = React.useState('');
  const [courseCode, setCourseCode] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [durationWeeks, setDurationWeeks] = React.useState(10);
  const [category, setCategory] = React.useState<
    'SAP Functional' | 'SAP Technical' | 'SAP Cloud' | 'Enterprise Other'
  >('SAP Functional');
  const [price, setPrice] = React.useState(45000);
  const [syllabusUrl, setSyllabusUrl] = React.useState('');

  // Edit Course state
  const [editCourseName, setEditCourseName] = React.useState('');
  const [editCourseCode, setEditCourseCode] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [editDurationWeeks, setEditDurationWeeks] = React.useState(10);
  const [editCategory, setEditCategory] = React.useState<
    'SAP Functional' | 'SAP Technical' | 'SAP Cloud' | 'Enterprise Other'
  >('SAP Functional');
  const [editPrice, setEditPrice] = React.useState(45000);
  const [editStatus, setEditStatus] = React.useState<'Draft' | 'Under Review' | 'Published' | 'Archived'>('Published');
  const [editSyllabusUrl, setEditSyllabusUrl] = React.useState('');

  // Module form state
  const [moduleTitle, setModuleTitle] = React.useState('');
  const [moduleDesc, setModuleDesc] = React.useState('');
  const [editModuleTitle, setEditModuleTitle] = React.useState('');
  const [editModuleDesc, setEditModuleDesc] = React.useState('');

  // Lesson form state
  const [lessonTitle, setLessonTitle] = React.useState('');
  const [lessonType, setLessonType] = React.useState<LessonType>('Video');
  const [durationMins, setDurationMins] = React.useState(45);
  const [contentUrl, setContentUrl] = React.useState('');
  const [isPublished, setIsPublished] = React.useState(true);

  const [editLessonTitle, setEditLessonTitle] = React.useState('');
  const [editLessonType, setEditLessonType] = React.useState<LessonType>('Video');
  const [editDurationMins, setEditDurationMins] = React.useState(45);
  const [editContentUrl, setEditContentUrl] = React.useState('');
  const [editIsPublished, setEditIsPublished] = React.useState(true);

  const refreshData = () => {
    setCourses([...store.courses]);
    if (selectedCourse) {
      const cMods = store.modules
        .filter((m) => m.course_id === selectedCourse.id)
        .sort((a, b) => a.order_index - b.order_index);
      setModules(cMods);
      const cLessons = store.lessons
        .filter((l) => l.course_id === selectedCourse.id)
        .sort((a, b) => a.order_index - b.order_index);
      setLessons(cLessons);
    } else {
      setModules([]);
      setLessons([]);
    }
  };

  React.useEffect(() => {
    refreshData();
  }, [selectedCourse, courses]);

  // Curriculum Review Approval Workflows
  const handleSubmitForReview = async () => {
    if (!selectedCourse) return;
    await updateCourse(selectedCourse.id, {
      status: 'Under Review',
    });
    refreshData();
  };

  const handleApproveAndPublish = async () => {
    if (!selectedCourse || !canPublishCourse) return;
    await updateCourse(selectedCourse.id, {
      status: 'Published',
    });
    refreshData();
  };

  const handleReturnToDraft = async () => {
    if (!selectedCourse || !canPublishCourse) return;
    await updateCourse(selectedCourse.id, {
      status: 'Draft',
    });
    refreshData();
  };

  // Open Edit Course Modal
  const openEditCourseModal = () => {
    if (!selectedCourse) return;
    setEditCourseName(selectedCourse.course_name);
    setEditCourseCode(selectedCourse.course_code);
    setEditCategory(selectedCourse.category);
    setEditDurationWeeks(selectedCourse.duration_weeks);
    setEditPrice(selectedCourse.price);
    setEditDescription(selectedCourse.description);
    setEditStatus(selectedCourse.status);
    setEditSyllabusUrl(selectedCourse.syllabus_url || '');
    setIsEditCourseModal(true);
  };

  // Open Edit Module Modal
  const openEditModuleModal = (mod: CourseModule) => {
    setEditingModule(mod);
    setEditModuleTitle(mod.title);
    setEditModuleDesc(mod.description || '');
    setIsEditModuleModal(true);
  };

  // Open Edit Lesson Modal
  const openEditLessonModal = (les: Lesson) => {
    setEditingLesson(les);
    setEditLessonTitle(les.title);
    setEditLessonType(les.lesson_type || (les.content_type as LessonType) || 'Video');
    setEditDurationMins(les.duration_minutes);
    setEditContentUrl(les.content_url || '');
    setEditIsPublished(les.is_published);
    setIsEditLessonModal(true);
  };

  // Create Course Handler
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName || !courseCode || !canCreateCourse) return;
    const initialStatus = canPublishCourse ? 'Published' : 'Draft';
    const newCourse = await createCourse({
      course_name: courseName,
      course_code: courseCode,
      description,
      duration_weeks: durationWeeks,
      category,
      price,
      status: initialStatus,
      syllabus_url: syllabusUrl || undefined,
    });
    setSelectedCourseId(newCourse.id);
    setIsAddCourseModal(false);
    setCourseName('');
    setCourseCode('');
    setDescription('');
    setSyllabusUrl('');
    refreshData();
  };

  // Update Course Handler
  const handleUpdateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !canEditCourse) return;
    await updateCourse(selectedCourse.id, {
      course_name: editCourseName,
      course_code: editCourseCode,
      category: editCategory,
      duration_weeks: editDurationWeeks,
      price: editPrice,
      description: editDescription,
      status: editStatus,
      syllabus_url: editSyllabusUrl || undefined,
    });
    setIsEditCourseModal(false);
    refreshData();
  };

  // Delete Course Handler
  const handleDeleteCourse = async () => {
    if (!selectedCourse || !canDeleteCourse) return;
    await deleteCourse(selectedCourse.id);
    setIsDeleteCourseModal(false);
    setSelectedCourseId(null);
    refreshData();
  };

  // Create Module Handler
  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moduleTitle || !selectedCourse || !canManageCurriculum) return;
    await createModule(selectedCourse.id, moduleTitle, moduleDesc);
    setIsAddModuleModal(false);
    setModuleTitle('');
    setModuleDesc('');
    refreshData();
  };

  // Update Module Handler
  const handleUpdateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule || !canManageCurriculum) return;
    await updateModule(editingModule.id, {
      title: editModuleTitle,
      description: editModuleDesc,
    });
    setIsEditModuleModal(false);
    setEditingModule(null);
    refreshData();
  };

  // Delete Module Handler
  const handleDeleteModule = async () => {
    if (!editingModule || !canManageCurriculum) return;
    await deleteModule(editingModule.id);
    setIsDeleteModuleModal(false);
    setEditingModule(null);
    refreshData();
  };

  // Reorder Module Handler
  const handleMoveModule = async (currentIndex: number, direction: 'up' | 'down') => {
    if (!selectedCourse || !canManageCurriculum) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= modules.length) return;

    const newModules = [...modules];
    const temp = newModules[currentIndex];
    newModules[currentIndex] = newModules[targetIndex];
    newModules[targetIndex] = temp;

    await reorderModules(
      selectedCourse.id,
      newModules.map((m) => m.id)
    );
    refreshData();
  };

  // Create Lesson Handler
  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonTitle || !activeModuleId || !selectedCourse || !canManageCurriculum) return;
    const moduleLessonsCount = lessons.filter((l) => l.module_id === activeModuleId).length;
    await createLesson({
      module_id: activeModuleId,
      course_id: selectedCourse.id,
      title: lessonTitle,
      lesson_type: lessonType,
      duration_minutes: durationMins,
      order_index: moduleLessonsCount + 1,
      is_published: isPublished,
      content_url: contentUrl,
    });
    setIsAddLessonModal(false);
    setLessonTitle('');
    setContentUrl('');
    refreshData();
  };

  // Update Lesson Handler
  const handleUpdateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson || !canManageCurriculum) return;
    await updateLesson(editingLesson.id, {
      title: editLessonTitle,
      lesson_type: editLessonType,
      duration_minutes: editDurationMins,
      content_url: editContentUrl,
      is_published: editIsPublished,
    });
    setIsEditLessonModal(false);
    setEditingLesson(null);
    refreshData();
  };

  // Delete Lesson Handler
  const handleDeleteLesson = async () => {
    if (!editingLesson || !canManageCurriculum) return;
    await deleteLesson(editingLesson.id);
    setIsDeleteLessonModal(false);
    setEditingLesson(null);
    refreshData();
  };

  // Reorder Lesson Handler
  const handleMoveLesson = async (
    moduleLessons: Lesson[],
    currentIndex: number,
    direction: 'up' | 'down'
  ) => {
    if (!canManageCurriculum) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= moduleLessons.length) return;

    const newLessons = [...moduleLessons];
    const temp = newLessons[currentIndex];
    newLessons[currentIndex] = newLessons[targetIndex];
    newLessons[targetIndex] = temp;

    await reorderLessons(
      newLessons[0].module_id,
      newLessons.map((l) => l.id)
    );
    refreshData();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            SAP Course & Curriculum LMS
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Build and organize courses, modules, video lectures, configuration guides, and published lessons.
          </p>
        </div>
        {canCreateCourse && (
          <Button
            variant="sap"
            size="sm"
            onClick={() => setIsAddCourseModal(true)}
            className="flex items-center space-x-1 text-xs"
          >
            <Plus className="h-4 w-4" />
            <span>New SAP Course</span>
          </Button>
        )}
      </div>

      {/* Role Scoping Notice for Trainers */}
      {role === 'trainer' && (
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="p-1 rounded bg-blue-100 text-[#0A6ED1]">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="text-slate-700">
              Logged in as Faculty:{' '}
              <strong className="text-slate-900">{user?.full_name || 'Trainer'}</strong>. Displaying courses assigned to your profile.
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-white">
            {allowedCourses.length} Assigned Course(s)
          </Badge>
        </div>
      )}

      {/* Course Selector Tabs */}
      {allowedCourses.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center space-y-3">
            {role === 'trainer' ? (
              <>
                <ShieldAlert className="h-10 w-10 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold text-slate-800">No Assigned SAP Courses</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Your faculty profile is currently not assigned to any SAP training modules. Under the institute RBAC policy, trainers can only view and manage curriculum for explicitly assigned courses.
                </p>
                <p className="text-[11px] text-slate-400">
                  Please contact the Academic Director to assign courses to your faculty account.
                </p>
              </>
            ) : (
              <>
                <BookOpen className="h-10 w-10 text-slate-400 mx-auto" />
                <h3 className="text-base font-bold text-slate-800">No Courses Available</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No courses found in the system. Click below to add the first enterprise SAP curriculum.
                </p>
                {canCreateCourse && (
                  <Button variant="sap" size="sm" onClick={() => setIsAddCourseModal(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    <span>Create First Course</span>
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {allowedCourses.map((crs) => (
            <div
              key={crs.id}
              onClick={() => setSelectedCourseId(crs.id)}
              className={`cursor-pointer p-4 rounded-xl border transition-all ${
                selectedCourse?.id === crs.id
                  ? 'bg-blue-50/80 border-[#0A6ED1] shadow-sm'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                  {crs.course_code}
                </span>
                <Badge variant={crs.status === 'Published' ? 'success' : 'secondary'}>
                  {crs.status}
                </Badge>
              </div>
              <h3 className="font-bold text-slate-900 text-sm mt-2 truncate">
                {crs.course_name}
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100">
                <span>{crs.duration_weeks} Weeks</span>
                <span className="font-bold text-slate-800">{formatINR(crs.price)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Course Curriculum Tree */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <CardTitle className="text-base">
                {selectedCourse?.course_name || 'Course Curriculum Structure'}
              </CardTitle>
              {selectedCourse?.category && (
                <Badge variant="outline">{selectedCourse.category}</Badge>
              )}
              {selectedCourse?.status && (
                <Badge
                  variant={
                    selectedCourse.status === 'Published'
                      ? 'success'
                      : selectedCourse.status === 'Under Review'
                      ? 'secondary'
                      : 'outline'
                  }
                  className={
                    selectedCourse.status === 'Under Review'
                      ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold'
                      : ''
                  }
                >
                  {selectedCourse.status}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedCourse?.description ||
                'Select an available course from the cards above to inspect its curriculum.'}
            </p>
          </div>

          {/* Course Actions Toolbar */}
          {selectedCourse && (
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              {/* Syllabus Download or Attach Action */}
              {selectedCourse.syllabus_url ? (
                <a
                  href={selectedCourse.syllabus_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-xs px-2.5 py-1.5 rounded-md border border-blue-200 bg-blue-50/80 text-blue-700 hover:bg-blue-100 font-medium transition-colors"
                  title="View or download official course syllabus"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Syllabus (PDF)</span>
                </a>
              ) : canEditCourse ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openEditCourseModal}
                  className="text-xs flex items-center space-x-1 text-slate-600 border-dashed"
                  title="Upload / attach syllabus PDF"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>Attach Syllabus</span>
                </Button>
              ) : null}

              {/* Curriculum Approval Workflow Actions */}
              {selectedCourse.status === 'Draft' && (
                <>
                  {role === 'trainer' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSubmitForReview}
                      className="text-xs flex items-center space-x-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                      title="Submit curriculum for Academic Reviewer sign-off"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Submit for Review</span>
                    </Button>
                  )}
                  {canPublishCourse && (
                    <Button
                      variant="sap"
                      size="sm"
                      onClick={handleApproveAndPublish}
                      className="text-xs flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      title="Publish course directly to LMS"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>Publish Course</span>
                    </Button>
                  )}
                </>
              )}

              {selectedCourse.status === 'Under Review' && (
                <>
                  {canPublishCourse ? (
                    <>
                      <Button
                        variant="sap"
                        size="sm"
                        onClick={handleApproveAndPublish}
                        className="text-xs flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        title="Approve curriculum and publish to LMS"
                      >
                        <FileCheck className="h-3.5 w-3.5" />
                        <span>Approve & Publish</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReturnToDraft}
                        className="text-xs flex items-center space-x-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                        title="Request revision and return to draft"
                      >
                        <span>Request Revision</span>
                      </Button>
                    </>
                  ) : (
                    <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md font-medium">
                      Under Review
                    </span>
                  )}
                </>
              )}

              {canEditCourse && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openEditCourseModal}
                  className="text-xs flex items-center space-x-1"
                >
                  <Edit2 className="h-3.5 w-3.5 text-slate-600" />
                  <span>Edit Course</span>
                </Button>
              )}
              {canDeleteCourse && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDeleteCourseModal(true)}
                  className="text-xs flex items-center space-x-1 text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete</span>
                </Button>
              )}
              {canManageCurriculum && (
                <Button
                  variant="sap"
                  size="sm"
                  onClick={() => setIsAddModuleModal(true)}
                  className="text-xs flex items-center space-x-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Module</span>
                </Button>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {/* Under Review Notice Banner */}
          {selectedCourse && selectedCourse.status === 'Under Review' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs animate-in fade-in">
              <div className="flex items-center space-x-2 text-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-amber-900">Curriculum Under Review</p>
                  <p className="text-[11px] text-amber-700">
                    Faculty submitted this syllabus for Academic Reviewer sign-off. Changes require director approval before student portal publication.
                  </p>
                </div>
              </div>
              {canPublishCourse && (
                <Button
                  size="sm"
                  onClick={handleApproveAndPublish}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-3 shrink-0"
                >
                  Sign Off & Publish
                </Button>
              )}
            </div>
          )}

          {!selectedCourse ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No course selected. Select a course above to view and manage curriculum modules.
            </div>
          ) : modules.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs space-y-2">
              <Layers className="h-8 w-8 text-slate-300 mx-auto" />
              <p>No modules added yet to this course.</p>
              {canManageCurriculum && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddModuleModal(true)}
                  className="text-xs mt-2"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  <span>Add First Module</span>
                </Button>
              )}
            </div>
          ) : (
            modules.map((mod, modIdx) => {
              const modLessons = lessons.filter((l) => l.module_id === mod.id);
              return (
                <div
                  key={mod.id}
                  className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 shadow-xs"
                >
                  {/* Module Header */}
                  <div className="p-3.5 bg-slate-100/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <Layers className="h-4 w-4 text-[#0A6ED1]" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Module {modIdx + 1}:
                      </span>
                      <h4 className="font-bold text-slate-800 text-xs">{mod.title}</h4>
                      <span className="text-[10px] text-slate-500 font-medium">
                        ({modLessons.length} lessons)
                      </span>
                    </div>

                    <div className="flex items-center space-x-1 self-end sm:self-center">
                      {/* Module Reordering Controls */}
                      {canManageCurriculum && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={modIdx === 0}
                            onClick={() => handleMoveModule(modIdx, 'up')}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                            title="Move Module Up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={modIdx === modules.length - 1}
                            onClick={() => handleMoveModule(modIdx, 'down')}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                            title="Move Module Down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModuleModal(mod)}
                            className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
                            title="Edit Module Title"
                          >
                            <Edit2 className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingModule(mod);
                              setIsDeleteModuleModal(true);
                            }}
                            className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            title="Delete Module"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </>
                      )}

                      {canManageCurriculum && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveModuleId(mod.id);
                            setIsAddLessonModal(true);
                          }}
                          className="text-xs h-7 px-2.5 text-[#0A6ED1] border-blue-200 hover:bg-blue-50"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Lesson
                        </Button>
                      )}
                    </div>
                  </div>

                  {mod.description && (
                    <div className="px-3.5 py-1.5 bg-slate-50 text-[11px] text-slate-500 border-b border-slate-200/60">
                      {mod.description}
                    </div>
                  )}

                  {/* Lessons Listing */}
                  <div className="p-3 space-y-2 bg-white">
                    {modLessons.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic py-2 text-center">
                        No lessons in this module. Click &apos;Add Lesson&apos; to upload or link curriculum content.
                      </p>
                    ) : (
                      modLessons.map((les, lesIdx) => (
                        <div
                          key={les.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50/80 text-xs transition-colors gap-2"
                        >
                          <div className="flex items-center space-x-3">
                            <span className="text-[10px] text-slate-400 font-mono w-4 text-center">
                              {lesIdx + 1}
                            </span>
                            {les.lesson_type === 'Video' ? (
                              <PlayCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                            ) : les.lesson_type === 'PDF' ? (
                              <FileText className="h-4 w-4 text-rose-600 flex-shrink-0" />
                            ) : (
                              <HelpCircle className="h-4 w-4 text-purple-600 flex-shrink-0" />
                            )}
                            <div>
                              <div className="flex items-center space-x-2">
                                <button
                                  type="button"
                                  onClick={() => openPreviewLessonModal(les)}
                                  className="text-left font-semibold text-slate-800 hover:text-blue-600 transition-colors"
                                  title="Click to preview lecture resource"
                                >
                                  {les.title}
                                </button>
                                <Badge
                                  variant={les.is_published ? 'success' : 'secondary'}
                                  className="text-[9px] px-1.5 py-0"
                                >
                                  {les.is_published ? 'Published' : 'Draft'}
                                </Badge>
                              </div>
                              <div className="flex items-center space-x-3 text-[10px] text-slate-400 mt-0.5">
                                <span>{les.duration_minutes} mins</span>
                                <span>•</span>
                                <span>{les.lesson_type}</span>
                                {les.content_url && (
                                  <>
                                    <span>•</span>
                                    <a
                                      href={les.content_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[#0A6ED1] hover:underline flex items-center space-x-0.5 truncate max-w-[200px]"
                                    >
                                      <Globe className="h-2.5 w-2.5 inline mr-0.5" />
                                      <span>{les.content_url}</span>
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Lesson Actions Toolbar */}
                          <div className="flex items-center space-x-1 self-end sm:self-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPreviewLessonModal(les)}
                              className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center space-x-1"
                              title="Preview Lecture / Resource"
                            >
                              <Eye className="h-3 w-3" />
                              <span>Preview</span>
                            </Button>
                            {canManageCurriculum && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={lesIdx === 0}
                                  onClick={() => handleMoveLesson(modLessons, lesIdx, 'up')}
                                  className="h-6 w-6 p-0 text-slate-400 hover:text-slate-800"
                                  title="Move Lesson Up"
                                >
                                  <MoveUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={lesIdx === modLessons.length - 1}
                                  onClick={() => handleMoveLesson(modLessons, lesIdx, 'down')}
                                  className="h-6 w-6 p-0 text-slate-400 hover:text-slate-800"
                                  title="Move Lesson Down"
                                >
                                  <MoveDown className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditLessonModal(les)}
                                  className="h-6 w-6 p-0 text-slate-500 hover:text-blue-600"
                                  title="Edit Lesson & Content URL"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingLesson(les);
                                    setIsDeleteLessonModal(true);
                                  }}
                                  className="h-6 w-6 p-0 text-slate-400 hover:text-rose-600"
                                  title="Delete Lesson"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* CREATE COURSE MODAL */}
      <Modal
        isOpen={isAddCourseModal}
        onClose={() => setIsAddCourseModal(false)}
        title="Add New SAP Course"
        description="Create enterprise curriculum structure for SAP modules."
      >
        <form onSubmit={handleCreateCourse} className="space-y-4 text-xs">
          <Input
            label="Course Name *"
            placeholder="e.g. SAP S/4HANA Finance (FICO)"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Course Code *"
              placeholder="e.g. SAP-FICO-2026"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="SAP Functional">SAP Functional</option>
                <option value="SAP Technical">SAP Technical</option>
                <option value="SAP Cloud">SAP Cloud</option>
                <option value="Enterprise Other">Enterprise Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duration (Weeks) *"
              type="number"
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(Number(e.target.value))}
              required
            />
            <Input
              label="Course Price (₹) *"
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Description & Objectives
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Comprehensive syllabus overview, target audience, and live project deliverables..."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          {/* Syllabus Attachment Upload */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Syllabus Attachment (PDF / Document)
            </label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="https://... or /syllabi/sap-course.pdf"
                value={syllabusUrl}
                onChange={(e) => setSyllabusUrl(e.target.value)}
                className="text-xs"
              />
              <label className="cursor-pointer shrink-0 px-2.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center space-x-1 text-xs">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSyllabusUrl(`/syllabi/${encodeURIComponent(file.name)}`);
                    }
                  }}
                />
              </label>
            </div>
            <p className="text-[10px] text-slate-400">
              Attach the official syllabus PDF for student and faculty reference.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddCourseModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Course
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT COURSE MODAL */}
      <Modal
        isOpen={isEditCourseModal}
        onClose={() => setIsEditCourseModal(false)}
        title="Edit Course Details"
        description={`Modify settings and syllabus details for ${selectedCourse?.course_name || 'Course'}`}
      >
        <form onSubmit={handleUpdateCourse} className="space-y-4 text-xs">
          <Input
            label="Course Name *"
            value={editCourseName}
            onChange={(e) => setEditCourseName(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Course Code *"
              value={editCourseCode}
              onChange={(e) => setEditCourseCode(e.target.value)}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Category *
              </label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="SAP Functional">SAP Functional</option>
                <option value="SAP Technical">SAP Technical</option>
                <option value="SAP Cloud">SAP Cloud</option>
                <option value="Enterprise Other">Enterprise Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Duration (Weeks) *"
              type="number"
              value={editDurationWeeks}
              onChange={(e) => setEditDurationWeeks(Number(e.target.value))}
              required
            />
            <Input
              label="Price (₹) *"
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(Number(e.target.value))}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Status *
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as any)}
                disabled={!canPublishCourse && editStatus === 'Published'}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 disabled:opacity-60"
              >
                {canPublishCourse && <option value="Published">Published</option>}
                <option value="Under Review">Under Review</option>
                <option value="Draft">Draft</option>
                {canPublishCourse && <option value="Archived">Archived</option>}
              </select>
              {!canPublishCourse && (
                <p className="text-[10px] text-amber-600 mt-1">
                  * Reviewer sign-off required from Academic Director to publish.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Description & Objectives
            </label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          {/* Syllabus Attachment in Edit Modal */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Syllabus Attachment (PDF / Document)
            </label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="https://... or /syllabi/sap-course.pdf"
                value={editSyllabusUrl}
                onChange={(e) => setEditSyllabusUrl(e.target.value)}
                className="text-xs"
              />
              <label className="cursor-pointer shrink-0 px-2.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center space-x-1 text-xs">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setEditSyllabusUrl(`/syllabi/${encodeURIComponent(file.name)}`);
                    }
                  }}
                />
              </label>
            </div>
            <p className="text-[10px] text-slate-400">
              Official curriculum guide / syllabus PDF for enrolled students.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditCourseModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE COURSE CONFIRMATION MODAL */}
      <Modal
        isOpen={isDeleteCourseModal}
        onClose={() => setIsDeleteCourseModal(false)}
        title="Delete Course Curriculum"
        description="Are you sure you want to permanently delete this course?"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2.5 text-rose-900">
            <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Permanent Deletion Warning</p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Deleting <strong>{selectedCourse?.course_name}</strong> will also remove all its curriculum modules and attached lessons from the LMS.
              </p>
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteCourseModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteCourse}
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* CREATE MODULE MODAL */}
      <Modal
        isOpen={isAddModuleModal}
        onClose={() => setIsAddModuleModal(false)}
        title="Add Curriculum Module"
        description={`Add a new module to ${selectedCourse?.course_name || 'Course'}`}
      >
        <form onSubmit={handleCreateModule} className="space-y-4 text-xs">
          <Input
            label="Module Title *"
            placeholder="e.g. Module 3: Asset Accounting on S/4HANA"
            value={moduleTitle}
            onChange={(e) => setModuleTitle(e.target.value)}
            required
          />
          <Input
            label="Module Description"
            placeholder="Key concepts covered in this module"
            value={moduleDesc}
            onChange={(e) => setModuleDesc(e.target.value)}
          />
          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddModuleModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Add Module
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT MODULE MODAL */}
      <Modal
        isOpen={isEditModuleModal}
        onClose={() => setIsEditModuleModal(false)}
        title="Edit Module Details"
        description="Update module title and scope"
      >
        <form onSubmit={handleUpdateModule} className="space-y-4 text-xs">
          <Input
            label="Module Title *"
            value={editModuleTitle}
            onChange={(e) => setEditModuleTitle(e.target.value)}
            required
          />
          <Input
            label="Module Description"
            value={editModuleDesc}
            onChange={(e) => setEditModuleDesc(e.target.value)}
          />
          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditModuleModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE MODULE MODAL */}
      <Modal
        isOpen={isDeleteModuleModal}
        onClose={() => setIsDeleteModuleModal(false)}
        title="Delete Module"
        description="Confirm module removal"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            Are you sure you want to delete module <strong>{editingModule?.title}</strong>? All associated lessons will be removed.
          </p>
          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteModuleModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteModule}
            >
              Delete Module
            </Button>
          </div>
        </div>
      </Modal>

      {/* CREATE LESSON MODAL */}
      <Modal
        isOpen={isAddLessonModal}
        onClose={() => setIsAddLessonModal(false)}
        title="Add Lesson / Video Content"
        description="Attach video lecture, study handout, or lab assignment"
      >
        <form onSubmit={handleCreateLesson} className="space-y-4 text-xs">
          <Input
            label="Lesson Title *"
            placeholder="e.g. 3.1 Depreciation Run & Asset Master Setup"
            value={lessonTitle}
            onChange={(e) => setLessonTitle(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Content Type *
              </label>
              <select
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Video">Video Lecture</option>
                <option value="PDF">PDF Reference Manual</option>
                <option value="Text">Reading Document</option>
                <option value="Quiz">Module Quiz</option>
                <option value="Assignment">Hands-on Lab Assignment</option>
              </select>
            </div>
            <Input
              label="Duration (Minutes) *"
              type="number"
              value={durationMins}
              onChange={(e) => setDurationMins(Number(e.target.value))}
            />
          </div>

          <Input
            label="Media / Video Content URL"
            placeholder="https://... or /videos/sap-fico/mod3.mp4"
            value={contentUrl}
            onChange={(e) => setContentUrl(e.target.value)}
          />

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="isPublishedCheck"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#0A6ED1] focus:ring-[#0A6ED1]"
            />
            <label htmlFor="isPublishedCheck" className="text-xs font-medium text-slate-700">
              Publish immediately (visible to enrolled students on LMS portal)
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddLessonModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Publish Lesson
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT LESSON MODAL */}
      <Modal
        isOpen={isEditLessonModal}
        onClose={() => setIsEditLessonModal(false)}
        title="Edit Lesson & Content URL"
        description="Update lesson details, content link, and publication status"
      >
        <form onSubmit={handleUpdateLesson} className="space-y-4 text-xs">
          <Input
            label="Lesson Title *"
            value={editLessonTitle}
            onChange={(e) => setEditLessonTitle(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Content Type *
              </label>
              <select
                value={editLessonType}
                onChange={(e) => setEditLessonType(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Video">Video Lecture</option>
                <option value="PDF">PDF Reference Manual</option>
                <option value="Text">Reading Document</option>
                <option value="Quiz">Module Quiz</option>
                <option value="Assignment">Hands-on Lab Assignment</option>
              </select>
            </div>
            <Input
              label="Duration (Minutes) *"
              type="number"
              value={editDurationMins}
              onChange={(e) => setEditDurationMins(Number(e.target.value))}
            />
          </div>

          <Input
            label="Media / Video Content URL"
            placeholder="https://... or /videos/sap-fico/mod3.mp4"
            value={editContentUrl}
            onChange={(e) => setEditContentUrl(e.target.value)}
          />

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="editIsPublishedCheck"
              checked={editIsPublished}
              onChange={(e) => setEditIsPublished(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#0A6ED1] focus:ring-[#0A6ED1]"
            />
            <label htmlFor="editIsPublishedCheck" className="text-xs font-medium text-slate-700">
              Published (visible to enrolled students on LMS portal)
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditLessonModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE LESSON MODAL */}
      <Modal
        isOpen={isDeleteLessonModal}
        onClose={() => setIsDeleteLessonModal(false)}
        title="Delete Lesson"
        description="Confirm lesson removal"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            Are you sure you want to delete lesson <strong>{editingLesson?.title}</strong>?
          </p>
          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteLessonModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteLesson}
            >
              Delete Lesson
            </Button>
          </div>
        </div>
      </Modal>

      {/* PREVIEW LESSON MODAL */}
      <Modal
        isOpen={isPreviewLessonModal}
        onClose={() => setIsPreviewLessonModal(false)}
        title={previewLesson?.title || 'Lesson Resource Preview'}
        description={`${previewLesson?.lesson_type || 'Lesson'} • ${previewLesson?.duration_minutes || 0} minutes • ${previewLesson?.is_published ? 'Published to LMS' : 'Draft'}`}
      >
        {previewLesson && (
          <div className="space-y-4 text-xs">
            {/* Media Content Preview Box */}
            {previewLesson.lesson_type === 'Video' ? (
              <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-900 flex flex-col items-center justify-center text-white relative shadow-inner">
                {previewLesson.content_url?.includes('youtube.com') || previewLesson.content_url?.includes('youtu.be') ? (
                  <iframe
                    src={previewLesson.content_url.replace('watch?v=', 'embed/')}
                    title={previewLesson.title}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : previewLesson.content_url?.endsWith('.mp4') || previewLesson.content_url?.endsWith('.webm') ? (
                  <video
                    controls
                    src={previewLesson.content_url}
                    className="w-full h-full object-contain"
                  >
                    Your browser does not support video playback.
                  </video>
                ) : (
                  <div className="p-6 text-center space-y-3">
                    <div className="h-14 w-14 rounded-full bg-blue-600/30 border border-blue-400 flex items-center justify-center mx-auto text-blue-400">
                      <PlayCircle className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-slate-200">SAP Interactive Lecture Stream</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                        {previewLesson.content_url
                          ? `Resource Stream: ${previewLesson.content_url}`
                          : 'Standard enterprise HLS adaptive stream ready for student portal playback.'}
                      </p>
                    </div>
                    <div className="flex items-center justify-center space-x-2 text-[10px] text-slate-400">
                      <span className="flex items-center"><Clock className="h-3 w-3 mr-1" /> {previewLesson.duration_minutes} Mins</span>
                      <span>•</span>
                      <span className="text-emerald-400 flex items-center"><CheckCircle className="h-3 w-3 mr-1" /> 1080p Full HD</span>
                    </div>
                  </div>
                )}
              </div>
            ) : previewLesson.lesson_type === 'PDF' || previewLesson.lesson_type === 'Document' ? (
              <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 text-center space-y-3">
                <FileText className="h-12 w-12 text-rose-500 mx-auto" />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Reference Handout / Manual</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Comprehensive study material and S/4HANA implementation blueprints.
                  </p>
                </div>
                {previewLesson.content_url ? (
                  <a
                    href={previewLesson.content_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 text-xs shadow-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Open / Download Document</span>
                  </a>
                ) : (
                  <p className="text-[10px] text-slate-400 italic">No external document link attached.</p>
                )}
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 text-center space-y-3">
                <HelpCircle className="h-12 w-12 text-purple-500 mx-auto" />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Interactive Assessment / Lab Task</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Hands-on practical assignment and knowledge check for this curriculum unit.
                  </p>
                </div>
                {previewLesson.content_url && (
                  <a
                    href={previewLesson.content_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 text-xs shadow-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Launch Resource Link</span>
                  </a>
                )}
              </div>
            )}

            {/* Lesson Metadata Summary */}
            <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-slate-100/70 border border-slate-200 text-[11px]">
              <div>
                <span className="text-slate-500">Module: </span>
                <span className="font-medium text-slate-800">
                  {modules.find((m) => m.id === previewLesson.module_id)?.title || 'Current Module'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Publication Status: </span>
                <span className="font-semibold text-slate-800">
                  {previewLesson.is_published ? 'Visible to Students' : 'Restricted (Draft)'}
                </span>
              </div>
              {previewLesson.content_url && (
                <div className="col-span-2 truncate">
                  <span className="text-slate-500">Direct Link: </span>
                  <a
                    href={previewLesson.content_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-mono"
                  >
                    {previewLesson.content_url}
                  </a>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              {canManageCurriculum ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsPreviewLessonModal(false);
                    openEditLessonModal(previewLesson);
                  }}
                  className="text-xs flex items-center space-x-1 text-slate-700"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Edit Lesson</span>
                </Button>
              ) : <div />}
              <Button
                type="button"
                variant="sap"
                size="sm"
                onClick={() => setIsPreviewLessonModal(false)}
              >
                Close Preview
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
