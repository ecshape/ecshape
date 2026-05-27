import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Plus, X, Trash2, Calculator } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api';

interface Client {
  id: number;
  full_name: string;
  email: string;
  profile?: {
    weight?: number;
    goals?: string;
    preferences?: string;
  };
}

interface MealComponent {
  type: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  is_optional: boolean;
}

interface MealEntry {
  name: string;
  order_index: number;
  notes?: string;
  components: MealComponent[];
}

const MEAL_CATEGORIES = [
  { id: 1, name: 'Breakfast', icon: '🌅', description: 'Start your day right' },
  { id: 2, name: 'Lunch', icon: '🌞', description: 'Midday fuel' },
  { id: 3, name: 'Dinner', icon: '🌙', description: 'Evening meal' },
  { id: 4, name: 'Snack', icon: '🍎', description: 'Between meals' },
  { id: 5, name: 'Pre-Workout', icon: '⚡', description: 'Energy boost' }
];

const CreateMealPlan = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect non-trainers away from trainer-only pages
  useEffect(() => {
    if (user) {
      if (user.role === 'CLIENT') {
        navigate('/', { replace: true });
      }
    }
  }, [user, navigate]);

  // Get client from location state
  const client = location.state?.client as Client;

  const [formData, setFormData] = useState({
    title: '',
    client_id: client?.id || null,
    total_calories: 0,
    protein_target: 0,
    carb_target: 0,
    fat_target: 0,
    notes: ''
  });

  const [meals, setMeals] = useState<MealEntry[]>([]);

  // Calculate totals from meals
  useEffect(() => {
    const totals = meals.reduce((acc, meal) => {
      meal.components.forEach(component => {
        acc.calories += component.calories;
        acc.protein += component.protein;
        acc.carbs += component.carbs;
        acc.fat += component.fat;
      });
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    setFormData(prev => ({
      ...prev,
      total_calories: totals.calories,
      protein_target: Math.round(totals.protein),
      carb_target: Math.round(totals.carbs),
      fat_target: Math.round(totals.fat)
    }));
  }, [meals]);

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addMeal = (categoryId: number) => {
    const category = MEAL_CATEGORIES.find(c => c.id === categoryId);
    const newMeal: MealEntry = {
      name: `${category?.name} ${meals.filter(m => m.order_index === categoryId).length + 1}`,
      order_index: categoryId,
      notes: '',
      components: []
    };

    setMeals(prev => [...prev, newMeal]);
  };

  const removeMeal = (mealIndex: number) => {
    setMeals(prev => prev.filter((_, index) => index !== mealIndex));
  };

  const updateMeal = (mealIndex: number, field: string, value: string) => {
    setMeals(prev => prev.map((meal, index) => 
      index === mealIndex ? { ...meal, [field]: value } : meal
    ));
  };

  const addComponent = (mealIndex: number) => {
    const newComponent: MealComponent = {
      type: '',
      description: '',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      is_optional: false
    };

    setMeals(prev => prev.map((meal, index) => 
      index === mealIndex 
        ? { ...meal, components: [...meal.components, newComponent] }
        : meal
    ));
  };

  const removeComponent = (mealIndex: number, componentIndex: number) => {
    setMeals(prev => prev.map((meal, index) => 
      index === mealIndex 
        ? { ...meal, components: meal.components.filter((_, cIndex) => cIndex !== componentIndex) }
        : meal
    ));
  };

  const updateComponent = (mealIndex: number, componentIndex: number, field: string, value: string | number | boolean) => {
    setMeals(prev => prev.map((meal, index) => 
      index === mealIndex 
        ? {
            ...meal,
            components: meal.components.map((component, cIndex) => 
              cIndex === componentIndex 
                ? { ...component, [field]: value }
                : component
            )
          }
        : meal
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (meals.length === 0) {
      setError('Please add at least one meal to the plan');
      setLoading(false);
      return;
    }

    // Validate that each meal has at least one component
    const invalidMeals = meals.filter(meal => meal.components.length === 0);
    if (invalidMeals.length > 0) {
      setError('Each meal must have at least one food component');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/meal-plans/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          created_by: user?.id,
          meals: meals
        }),
      });

      if (response.ok) {
        navigate('/trainer-dashboard?tab=meals');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to create meal plan');
      }
    } catch (error) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    return formData.title && formData.client_id && meals.length > 0;
  };

  const getMealsByCategory = (categoryId: number) => {
    return meals.filter(meal => meal.order_index === categoryId);
  };

  return (
    <Layout currentPage="dashboard">
      <div className="container mx-auto p-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate('/trainer-dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Create Meal Plan</h1>
              <p className="text-muted-foreground">
                {client ? `Creating meal plan for ${client.full_name}` : 'Create a new meal plan'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Meal Plan Information */}
          <Card>
            <CardHeader>
              <CardTitle>Meal Plan Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Meal Plan Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="e.g., Weight Loss Plan, Muscle Building, Maintenance"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">General Notes</Label>
                  <Input
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder="Any general notes for this meal plan..."
                  />
                </div>
              </div>

              {/* Nutritional Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-secondary/50 rounded-lg">
                <div className="text-center">
                  <Label className="text-sm font-medium text-muted-foreground">Total Calories</Label>
                  <p className="text-2xl font-bold text-foreground">{formData.total_calories}</p>
                </div>
                <div className="text-center">
                  <Label className="text-sm font-medium text-muted-foreground">Protein (g)</Label>
                  <p className="text-2xl font-bold text-foreground">{formData.protein_target}</p>
                </div>
                <div className="text-center">
                  <Label className="text-sm font-medium text-muted-foreground">Carbs (g)</Label>
                  <p className="text-2xl font-bold text-foreground">{formData.carb_target}</p>
                </div>
                <div className="text-center">
                  <Label className="text-sm font-medium text-muted-foreground">Fat (g)</Label>
                  <p className="text-2xl font-bold text-foreground">{formData.fat_target}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Client Information */}
          {client && (
            <Card>
              <CardHeader>
                <CardTitle>Client Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Client Name</Label>
                    <p className="text-foreground font-medium">{client.full_name}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                    <p className="text-foreground">{client.email}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Goals</Label>
                    <p className="text-foreground">{client.profile?.goals || 'Not specified'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Meal Categories */}
          <div className="space-y-6">
            {MEAL_CATEGORIES.map((category) => (
              <Card key={category.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{category.icon}</span>
                      <div>
                        <CardTitle>{category.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{category.description}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => addMeal(category.id)}
                      variant="outline"
                      size="sm"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Meal
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {getMealsByCategory(category.id).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No meals added yet</p>
                      <p className="text-sm">Click "Add Meal" to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {getMealsByCategory(category.id).map((meal, mealIndex) => {
                        const globalMealIndex = meals.findIndex(m => m === meal);
                        return (
                          <div key={globalMealIndex} className="border rounded-lg p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <Input
                                  value={meal.name}
                                  onChange={(e) => updateMeal(globalMealIndex, 'name', e.target.value)}
                                  className="font-medium w-48"
                                  placeholder="Meal name"
                                />
                                <Badge variant="outline">{meal.components.length} items</Badge>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeMeal(globalMealIndex)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>

                            {/* Meal Notes */}
                            <div>
                              <Label className="text-sm text-muted-foreground">Personalized Notes</Label>
                              <Textarea
                                value={meal.notes || ''}
                                onChange={(e) => updateMeal(globalMealIndex, 'notes', e.target.value)}
                                placeholder="Add personalized notes for this client (e.g., timing, preferences, modifications)..."
                                rows={2}
                                className="text-sm"
                              />
                            </div>

                            {/* Food Components */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">Food Components</Label>
                                <Button
                                  type="button"
                                  onClick={() => addComponent(globalMealIndex)}
                                  variant="outline"
                                  size="sm"
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Add Food
                                </Button>
                              </div>

                              {meal.components.map((component, componentIndex) => (
                                <div key={componentIndex} className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 border rounded bg-secondary/30">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Type</Label>
                                    <Input
                                      value={component.type}
                                      onChange={(e) => updateComponent(globalMealIndex, componentIndex, 'type', e.target.value)}
                                      placeholder="e.g., Protein, Carb, Fat"
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <Label className="text-xs text-muted-foreground">Description</Label>
                                    <Input
                                      value={component.description}
                                      onChange={(e) => updateComponent(globalMealIndex, componentIndex, 'description', e.target.value)}
                                      placeholder="e.g., Grilled chicken breast, Brown rice"
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Calories</Label>
                                    <Input
                                      type="number"
                                      value={component.calories}
                                      onChange={(e) => updateComponent(globalMealIndex, componentIndex, 'calories', parseInt(e.target.value) || 0)}
                                      className="h-8 text-sm"
                                      min="0"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Protein (g)</Label>
                                    <Input
                                      type="number"
                                      value={component.protein}
                                      onChange={(e) => updateComponent(globalMealIndex, componentIndex, 'protein', parseFloat(e.target.value) || 0)}
                                      className="h-8 text-sm"
                                      min="0"
                                      step="0.1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Carbs (g)</Label>
                                    <Input
                                      type="number"
                                      value={component.carbs}
                                      onChange={(e) => updateComponent(globalMealIndex, componentIndex, 'carbs', parseFloat(e.target.value) || 0)}
                                      className="h-8 text-sm"
                                      min="0"
                                      step="0.1"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Fat (g)</Label>
                                    <Input
                                      type="number"
                                      value={component.fat}
                                      onChange={(e) => updateComponent(globalMealIndex, componentIndex, 'fat', parseFloat(e.target.value) || 0)}
                                      className="h-8 text-sm"
                                      min="0"
                                      step="0.1"
                                    />
                                  </div>
                                  <div className="md:col-span-5 flex items-center space-x-2">
                                    <label className="flex items-center space-x-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={component.is_optional}
                                        onChange={(e) => updateComponent(globalMealIndex, componentIndex, 'is_optional', e.target.checked)}
                                        className="w-3 h-3"
                                      />
                                      <span>Optional</span>
                                    </label>
                                  </div>
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeComponent(globalMealIndex, componentIndex)}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Error Display */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2 text-red-600">
                  <X className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/trainer-dashboard')}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid() || loading}
              className="gradient-orange"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Creating...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>Create Meal Plan</span>
                </div>
              )}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default CreateMealPlan; 