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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { Course, CourseModule, Lesson } from '@/types';
import { createCourse, createModule, createLesson } from '@/lib/services/academics-service';
import { formatINR } from '@/lib/utils/formatters';

export default function CoursesPage() {
  const [courses, setCourses] = React.useState<Course[]>(store.courses);
  const [selectedCourse, setSelectedCourse] = React.useState<Course>(store.courses[0]);
  const [modules, setModules] = React.useState<CourseModule[]>([]);
  const [lessons, setLessons] = React.useState<Lesson[]>([]);
  const [isAddCourseModal, setIsAddCourseModal] = React.useState(false);
  const [isAddModuleModal, setIsAddModuleModal] = React.useState(false);
  const [isAddLessonModal, setIsAddLessonModal] = React.useState(false);
  const [activeModuleId, setActiveModuleId] = React.useState<string | null>(null);

  // New Course state
  const [courseName, setCourseName] = React.useState('');
  const [courseCode, setCourseCode] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [durationWeeks, setDurationWeeks] = React.useState(10);
  const [category, setCategory] = React.useState<'SAP Functional' | 'SAP Technical' | 'SAP Cloud' | 'Enterprise Other'>('SAP Functional');
  const [price, setPrice] = React.useState(45000);

  // New Module state
  const [moduleTitle, setModuleTitle] = React.useState('');
  const [moduleDesc, setModuleDesc] = React.useState('');

  // New Lesson state
  const [lessonTitle, setLessonTitle] = React.useState('');
  const [lessonType, setLessonType] = React.useState<'Video' | 'PDF' | 'Text' | 'Quiz' | 'Assignment'>('Video');
  const [durationMins, setDurationMins] = React.useState(45);
  const [contentUrl, setContentUrl] = React.useState('');

  const refreshData = () => {
    setCourses([...store.courses]);
    if (selectedCourse) {
      const cMods = store.modules.filter((m) => m.course_id === selectedCourse.id);
      setModules(cMods);
      const cLessons = store.lessons.filter((l) => l.course_id === selectedCourse.id);
      setLessons(cLessons);
    }
  };

  React.useEffect(() => {
    refreshData();
  }, [selectedCourse]);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName || !courseCode) return;
    const newCourse = await createCourse({
      course_name: courseName,
      course_code: courseCode,
      description,
      duration_weeks: durationWeeks,
      category,
      price,
      status: 'Published',
    });
    setSelectedCourse(newCourse);
    setIsAddCourseModal(false);
    refreshData();
  };

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moduleTitle) return;
    await createModule(selectedCourse.id, moduleTitle, moduleDesc);
    setIsAddModuleModal(false);
    setModuleTitle('');
    refreshData();
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonTitle || !activeModuleId) return;
    await createLesson({
      module_id: activeModuleId,
      course_id: selectedCourse.id,
      title: lessonTitle,
      lesson_type: lessonType,
      duration_minutes: durationMins,
      order_index: lessons.length + 1,
      is_published: true,
      content_url: contentUrl,
    });
    setIsAddLessonModal(false);
    setLessonTitle('');
    refreshData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">SAP Course & Curriculum LMS</h1>
          <p className="text-xs text-slate-500 mt-1">
            Build and organize courses, modules, video lectures, configuration guides, and published lessons.
          </p>
        </div>
        <Button variant="sap" size="sm" onClick={() => setIsAddCourseModal(true)} className="flex items-center space-x-1 text-xs">
          <Plus className="h-4 w-4" />
          <span>New SAP Course</span>
        </Button>
      </div>

      {/* Course Selector Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {courses.map((crs) => (
          <div
            key={crs.id}
            onClick={() => setSelectedCourse(crs)}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              selectedCourse.id === crs.id
                ? 'bg-blue-50/80 border-[#0A6ED1] shadow-sm'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                {crs.course_code}
              </span>
              <Badge variant={crs.status === 'Published' ? 'success' : 'secondary'}>{crs.status}</Badge>
            </div>
            <h3 className="font-bold text-slate-900 text-sm mt-2 truncate">{crs.course_name}</h3>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100">
              <span>{crs.duration_weeks} Weeks</span>
              <span className="font-bold text-slate-800">{formatINR(crs.price)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Course Curriculum Tree */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <CardTitle className="text-base">{selectedCourse.course_name}</CardTitle>
              <Badge variant="outline">{selectedCourse.category}</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{selectedCourse.description}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddModuleModal(true)}
            className="text-xs flex items-center space-x-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Module</span>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {modules.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No modules added yet. Click &apos;Add Module&apos; to begin structuring the course.
            </div>
          ) : (
            modules.map((mod) => {
              const modLessons = lessons.filter((l) => l.module_id === mod.id);
              return (
                <div key={mod.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                  <div className="p-3.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Layers className="h-4 w-4 text-[#0A6ED1]" />
                      <h4 className="font-bold text-slate-800 text-xs">{mod.title}</h4>
                      <span className="text-[10px] text-slate-500 font-medium">({modLessons.length} lessons)</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setActiveModuleId(mod.id);
                        setIsAddLessonModal(true);
                      }}
                      className="text-xs h-7 px-2 text-[#0A6ED1] hover:bg-blue-50"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Lesson
                    </Button>
                  </div>

                  <div className="p-3 space-y-2 bg-white">
                    {modLessons.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">No lessons in this module.</p>
                    ) : (
                      modLessons.map((les) => (
                        <div
                          key={les.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 text-xs transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            {les.lesson_type === 'Video' ? (
                              <PlayCircle className="h-4 w-4 text-blue-600" />
                            ) : les.lesson_type === 'PDF' ? (
                              <FileText className="h-4 w-4 text-rose-600" />
                            ) : (
                              <HelpCircle className="h-4 w-4 text-purple-600" />
                            )}
                            <div>
                              <p className="font-semibold text-slate-800">{les.title}</p>
                              <p className="text-[10px] text-slate-400">{les.duration_minutes} mins</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge variant={les.is_published ? 'success' : 'secondary'} className="text-[10px]">
                              {les.is_published ? 'Published' : 'Draft'}
                            </Badge>
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

      {/* Create Course Modal */}
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

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddCourseModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Course
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Module Modal */}
      <Modal
        isOpen={isAddModuleModal}
        onClose={() => setIsAddModuleModal(false)}
        title="Add Curriculum Module"
        description={`Add a new module to ${selectedCourse.course_name}`}
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
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddModuleModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Add Module
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Lesson Modal */}
      <Modal
        isOpen={isAddLessonModal}
        onClose={() => setIsAddLessonModal(false)}
        title="Add Lesson / Video Content"
        description="Attach video lecture or study handout"
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

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsAddLessonModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Publish Lesson
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
