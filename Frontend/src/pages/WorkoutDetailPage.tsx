
import React, { useState } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, Clock, CheckCircle, Circle, Play, Pause, RotateCcw, Trophy } from 'lucide-react';
import { useParams } from 'react-router-dom';

interface Exercise {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  completed: boolean;
  notes?: string;
}

const WorkoutDetailPage = () => {
  const { id } = useParams();
  
  // Mock workout data - in real app this would come from API
  const [workout] = useState({
    id: 1,
    name: "Upper Body Strength",
    day: "Monday",
    duration: "45 min",
    difficulty: "Intermediate",
    completed: false,
    exercises: [
      { name: "Push-ups", sets: 3, reps: "12-15", rest: "60s", completed: false, notes: "Keep core tight throughout the movement" },
      { name: "Pull-ups", sets: 3, reps: "8-10", rest: "90s", completed: false, notes: "Full range of motion, controlled movement" },
      { name: "Bench Press", sets: 4, reps: "8-10", rest: "120s", completed: false, notes: "Focus on proper form over weight" },
      { name: "Rows", sets: 3, reps: "10-12", rest: "60s", completed: false, notes: "Squeeze shoulder blades together" },
      { name: "Shoulder Press", sets: 3, reps: "10-12", rest: "60s", completed: false, notes: "Keep core engaged" }
    ]
  });

  const [exercises, setExercises] = useState<Exercise[]>(workout.exercises);
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [currentExercise, setCurrentExercise] = useState(0);

  const completedExercises = exercises.filter(ex => ex.completed).length;
  const progressPercentage = (completedExercises / exercises.length) * 100;

  const toggleExerciseCompletion = (index: number) => {
    const updatedExercises = [...exercises];
    updatedExercises[index].completed = !updatedExercises[index].completed;
    setExercises(updatedExercises);
  };

  const startTimer = () => {
    setIsRunning(true);
    // In a real app, you'd implement actual timer logic here
  };

  const pauseTimer = () => {
    setIsRunning(false);
  };

  const resetTimer = () => {
    setTimer(0);
    setIsRunning(false);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'Intermediate': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'; 
      case 'Advanced': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-secondary text-muted-foreground';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Layout currentPage="training">
      <div className="pb-20 lg:pb-8">
        {/* Header */}
        <div className="bg-gradient-to-br from-card to-secondary px-4 lg:px-6 py-6 lg:py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center space-x-4 mb-4">
              <div className="w-12 h-12 gradient-orange rounded-xl flex items-center justify-center shadow-xl">
                <Dumbbell className="w-7 h-7 text-background" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl lg:text-3xl font-bold text-gradient">{workout.name}</h1>
                <div className="flex items-center space-x-4 mt-2">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {workout.duration}
                  </Badge>
                  <Badge className={getDifficultyColor(workout.difficulty)}>
                    {workout.difficulty}
                  </Badge>
                  <span className="text-muted-foreground text-sm">{workout.day}</span>
                </div>
              </div>
            </div>

            {/* Progress Overview */}
            <Card className="bg-gradient-to-br from-card/50 to-secondary/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-lg font-semibold text-foreground">
                    Progress: {completedExercises}/{exercises.length} exercises
                  </span>
                  <Badge variant={progressPercentage >= 100 ? "default" : "secondary"} 
                         className={progressPercentage >= 100 ? "gradient-orange text-background" : ""}>
                    {Math.round(progressPercentage)}% Complete
                  </Badge>
                </div>
                <Progress value={progressPercentage} className="h-3 bg-secondary" />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6 space-y-6">
          {/* Timer Card */}
          <Card className="bg-gradient-to-br from-card to-secondary border-border/50 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Workout Timer</span>
                <div className="flex space-x-2">
                  {!isRunning ? (
                    <Button onClick={startTimer} size="sm" className="gradient-orange text-background">
                      <Play className="w-4 h-4 mr-2" />
                      Start
                    </Button>
                  ) : (
                    <Button onClick={pauseTimer} size="sm" variant="outline">
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </Button>
                  )}
                  <Button onClick={resetTimer} size="sm" variant="outline">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-4xl font-mono font-bold text-primary mb-2">
                  {formatTime(timer)}
                </div>
                <p className="text-muted-foreground">Total workout time</p>
              </div>
            </CardContent>
          </Card>

          {/* Exercises List */}
          <div className="space-y-4">
            {exercises.map((exercise, index) => (
              <Card 
                key={index} 
                className={`transform hover:scale-[1.02] transition-all duration-300 shadow-xl ${
                  exercise.completed 
                    ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30' 
                    : currentExercise === index
                    ? 'bg-gradient-to-r from-primary/10 to-orange-500/10 border-primary/30'
                    : 'bg-card/50 backdrop-blur-sm border-border/50 hover:bg-card/80'
                }`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExerciseCompletion(index)}
                      className="p-0 h-auto hover:bg-transparent transform hover:scale-110 transition-transform mt-1"
                    >
                      {exercise.completed ? (
                        <CheckCircle className="w-8 h-8 text-green-500" />
                      ) : (
                        <Circle className="w-8 h-8 text-muted-foreground hover:text-primary" />
                      )}
                    </Button>

                    <div className="flex-1 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className={`text-xl font-semibold ${exercise.completed ? 'text-green-400' : 'text-foreground'}`}>
                            {index + 1}. {exercise.name}
                          </h3>
                          <div className="flex items-center space-x-4 mt-2">
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
                              {exercise.sets} sets
                            </Badge>
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30">
                              {exercise.reps} reps
                            </Badge>
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
                              Rest: {exercise.rest}
                            </Badge>
                          </div>
                        </div>
                        
                        {currentExercise === index && (
                          <Badge className="gradient-orange text-background animate-pulse">
                            Current
                          </Badge>
                        )}
                      </div>

                      {exercise.notes && (
                        <div className="p-3 bg-secondary/50 rounded-lg border border-border/30">
                          <p className="text-sm text-muted-foreground">
                            <strong>Note:</strong> {exercise.notes}
                          </p>
                        </div>
                      )}

                      <div className="flex space-x-2">
                        {currentExercise !== index && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setCurrentExercise(index)}
                          >
                            Make Current
                          </Button>
                        )}
                        {!exercise.completed && (
                          <Button
                            size="sm"
                            onClick={() => toggleExerciseCompletion(index)}
                            className="gradient-orange text-background"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Mark Complete
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Completion Card */}
          {progressPercentage >= 100 && (
            <Card className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30 shadow-xl">
              <CardContent className="p-6 text-center">
                <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-green-400 mb-2">Workout Complete!</h2>
                <p className="text-muted-foreground mb-4">
                  Congratulations! You've completed all exercises in this workout.
                </p>
                <div className="flex justify-center space-x-4">
                  <Button className="gradient-orange text-background">
                    Save Results
                  </Button>
                  <Button variant="outline">
                    View Next Workout
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default WorkoutDetailPage;
