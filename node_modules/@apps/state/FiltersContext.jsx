import React, { createContext, useContext, useState } from 'react'
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';

const FiltersContext = createContext(null)
const defaultTime = '30'

export function FiltersProvider({children}){
  const [categories, setCategories] = useState([]) // [] = todas
  const [timeRange, setTimeRange] = useState(localStorage.getItem('timeRange') || defaultTime)
  const [isMarkAllActive, setIsMarkAllActive] = useState(false) // NEW: Track "Marcar todas" state

  const toggleCategory = (cat)=>{
    setCategories(prev => prev.includes(cat) ? prev.filter(c=>c!==cat) : [...prev, cat])
    setIsMarkAllActive(false) // Reset mark all when toggling individual categories
  }
  
  const clearCategories = ()=> {
    setCategories([])
    setIsMarkAllActive(false) // Reset mark all when clearing
  }
  
  const markAll = (all)=> {
    setCategories(all)
    setIsMarkAllActive(true) // Set mark all as active when clicked
  }
  
  const setRange = (r)=> { 
    setTimeRange(r); 
    localStorage.setItem('timeRange', r) 
  }

  return (
    <FiltersContext.Provider value={{
      categories, 
      setCategories, 
      toggleCategory, 
      clearCategories, 
      markAll, 
      timeRange, 
      setRange,
      isMarkAllActive // NEW: Expose the mark all state
    }}>
      {children}
    </FiltersContext.Provider>
  )
}

export const useFilters = ()=> useContext(FiltersContext)